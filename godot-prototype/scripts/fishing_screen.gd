extends Control
## The fishing mini-game's screen (a port of src/ui/fishing.ts). While you
## fish, the dock becomes [Cancel] [Cast], where Cast turns into Reel in once
## the line is out, and Reel in turns into Pull once a fish is hooked: hold
## it to drag the dot right on the catch bar, let go and it drifts back
## left. Water rises up under the room into the pond (scripts/pond.gd).
##
## While you wait, a fish may nibble first: the bait dips a little, and
## reeling in then scares it off. A bite wiggles the button and buzzes the
## phone. A landed fish flips up out of the water, and a perfect catch gets a
## big "Perfect!" with a count of perfects in a row.
##
## Only the timing lives here. The rules are in scripts/fishing_rules.gd and
## every number is in data/fishing.tres.

signal exited
signal phase_changed(phase: String)
signal say(text: String)

const T: FishingTuning = preload("res://data/fishing.tres")
const SOUNDS := {
	"cast": preload("res://audio/fish-cast.mp3"),
	"nibble": preload("res://audio/fish-nibble.mp3"),
	"bite": preload("res://audio/fish-bite.mp3"),
	"reel": preload("res://audio/fish-reel.mp3"),
	"splash": preload("res://audio/fish-splash.mp3"),
	"escape": preload("res://audio/fish-escape.mp3"),
	"perfect": preload("res://audio/fish-perfect.mp3"),
	"fill": preload("res://audio/pond-fill.mp3"),
	"drain": preload("res://audio/pond-drain.mp3"),
}
const GRADES := {"perfect": "Perfect catch!", "good": "Good catch!", "weak": "Weak catch...", "miss": "No catch."}
## How long the bar stays up after a catch, showing where the dot ended up.
const RESULT_SECONDS := 0.9
const RISE_SECONDS := 0.7
const DRAIN_SECONDS := 0.45
const LEAP_SECONDS := 0.65
const REEL_TICK := 0.09

@onready var clip: Control = %PondClip
@onready var fill: Control = %PondFill
@onready var view: TextureRect = %PondView
@onready var pond_viewport: SubViewport = %PondViewport
@onready var pond: Node2D = %Pond
@onready var bar: Control = %CatchBar
@onready var cheer: Control = %Cheer
@onready var row: Control = %FishRow
@onready var main_button: Button = %FishMain

## off, ready, waiting, nibble, bite or reeling.
var phase := "off"
var _timers: Array = [] # [seconds left, Callable]
var _reel := {}
var _hooked: FishKind
var _held := false
var _swallow_tap := false
var _streak := 0
var _last_perfect := false
var _tick_in := 0.0
var _wiggle: Tween
var _water: Tween
var _players: Array[AudioStreamPlayer] = []


func _ready() -> void:
	view.texture = pond_viewport.get_texture()
	view.resized.connect(_fit_pond)
	%FishCancel.pressed.connect(stop)
	main_button.pressed.connect(_on_main)
	main_button.button_down.connect(_on_down)
	main_button.button_up.connect(func() -> void: _set_held(false))
	for i in 3:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)


## Places the pond under the room: `top` is where it starts on screen.
func place(top: float) -> void:
	var w := size.x - 32
	clip.position = Vector2(16, top)
	clip.size = Vector2(w, roundf(w * 0.38))
	fill.size = clip.size


func _fit_pond() -> void:
	if view.size.x <= 0:
		return
	pond_viewport.size = Vector2i(96, maxi(24, roundi(view.size.y / view.size.x * 96.0)))
	pond.resize(pond_viewport.size.y)


## Lines the pond's line up under the rod's, `screen_x` across the screen.
func align_line(screen_x: float) -> void:
	var x := (screen_x - view.global_position.x) / view.size.x * 96.0
	pond.line_x = floori(x)


func start() -> void:
	visible = true
	_set_phase("ready")
	_streak = 0
	_last_perfect = false
	bar.hide()
	cheer.hide()
	_fit_pond()
	# The water rises up from the bottom, surface first.
	fill.position.y = clip.size.y
	if _water:
		_water.kill()
	_water = create_tween()
	_water.tween_property(fill, "position:y", 0.0, RISE_SECONDS).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	row.modulate.a = 0.0
	row.position.y += 24
	var t := create_tween().set_parallel()
	t.tween_property(row, "modulate:a", 1.0, 0.2)
	t.tween_property(row, "position:y", row.position.y - 24, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_sound("fill")
	say.emit("Tap Cast to throw your line!")


func stop() -> void:
	if phase == "off":
		return
	_sound("drain")
	_clear()
	_hooked = null
	_set_phase("off")
	bar.hide()
	row.hide()
	if _water:
		_water.kill()
	_water = create_tween()
	_water.tween_property(fill, "position:y", clip.size.y, DRAIN_SECONDS).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_water.tween_callback(hide)
	exited.emit()


func _set_phase(next: String) -> void:
	phase = next
	pond.phase = "ready" if next == "off" else next
	row.visible = next != "off"
	main_button.disabled = false
	match next:
		"reeling": main_button.text = "Pull"
		"waiting", "nibble", "bite": main_button.text = "Reel in"
		_: main_button.text = "Cast"
	# A fish is biting: the button wiggles to say "now!".
	if _wiggle:
		_wiggle.kill()
		_wiggle = null
		main_button.rotation = 0
		main_button.scale = Vector2.ONE
	if next == "bite":
		main_button.pivot_offset = main_button.size / 2
		main_button.scale = Vector2.ONE * 1.02
		main_button.rotation = deg_to_rad(-2)
		_wiggle = create_tween().set_loops()
		_wiggle.tween_property(main_button, "rotation", deg_to_rad(2), 0.3).set_trans(Tween.TRANS_SINE)
		_wiggle.tween_property(main_button, "rotation", deg_to_rad(-2), 0.3).set_trans(Tween.TRANS_SINE)
	phase_changed.emit(next)
	_tell_page()


# --- Timers that can all be called off at once ---------------------------

func _after(seconds: float, f: Callable) -> void:
	_timers.append([seconds, f])


func _clear() -> void:
	_timers.clear()
	_reel = {}
	_set_held(false)


func _process(delta: float) -> void:
	for timer in _timers.duplicate():
		timer[0] -= delta
		if timer[0] <= 0 and _timers.has(timer):
			_timers.erase(timer)
			timer[1].call()
	if phase == "reeling" and not _reel.is_empty():
		_step_reel(delta)


# --- Casting, nibbles and the bite -----------------------------------------

func _on_main() -> void:
	if _swallow_tap:
		_swallow_tap = false
		return
	match phase:
		"ready": _cast()
		"waiting", "nibble", "bite": _reel_in()


func _on_down() -> void:
	_swallow_tap = false # a new press is a new tap
	if phase == "reeling":
		_set_held(true)


func _set_held(on: bool) -> void:
	_held = on and phase == "reeling"
	if _held:
		_tick_in = 0.0


func _cast() -> void:
	if not _last_perfect:
		_streak = 0
	var why := Game.cast()
	if why != "":
		say.emit("%s is %s" % [Game.pet_name(), "asleep. Let it rest!" if why == "asleep" else "too tired to fish."])
		return
	_hooked = FishingRules.pick_fish(T, randf(), _streak)
	_last_perfect = false
	_sound("cast")
	_set_phase("waiting")
	pond.hook(_hooked.shadow)
	var bite := FishingRules.bite_delay(T, randf())
	_after(bite, _bite)
	for at in FishingRules.nibble_times(T, bite, randf(), [randf(), randf()]):
		_after(at, _nibble)


## A quick dip of the bait that isn't the real bite yet.
func _nibble() -> void:
	if phase != "waiting":
		return
	_set_phase("nibble")
	_sound("nibble")
	_after(T.nibble_seconds, func() -> void:
		if phase == "nibble":
			_set_phase("waiting"))


func _bite() -> void:
	_set_phase("bite")
	Input.vibrate_handheld(30)
	_sound("bite")
	_after(T.bite_window, func() -> void:
		_sound("escape")
		say.emit("The fish got away...")
		pond.landed(false)
		_back_to_ready())


func _reel_in() -> void:
	var was := phase
	_clear()
	if was != "bite":
		say.emit("That was only a nibble! The fish swam off." if was == "nibble" else "Too soon! Nothing was biting yet.")
		_sound("escape")
		pond.landed(false)
		_back_to_ready()
		return
	_reel = FishingRules.start_reel(T, randf(), _hooked)
	bar.show_reel(T, _reel)
	bar.show()
	_set_phase("reeling")
	say.emit(_hooked.hold_line)


func _step_reel(delta: float) -> void:
	FishingRules.step_reel(T, _reel, _held, delta, randf())
	if _held:
		_tick_in -= delta
		if _tick_in <= 0:
			_sound("reel", 2)
			_tick_in = REEL_TICK
	bar.show_reel(T, _reel)
	_tell_page()
	match FishingRules.outcome(_reel):
		"lost":
			_sound("escape")
			say.emit("The line went slack. The fish swam off.")
			pond.landed(false)
			_back_to_ready()
		"landed":
			_landed()


func _landed() -> void:
	var grade := FishingRules.grade(T, _reel)
	_clear()
	bar.blink()
	var caught := grade != "miss" and _hooked != null
	pond.landed(caught)
	if caught:
		Game.land(_hooked)
		_sound("splash")
		_leap(_hooked.food.icon)
		say.emit("%s A %s for the pantry." % [GRADES[grade], _hooked.display_name.to_lower()])
	else:
		say.emit(GRADES[grade])
	_hooked = null
	if grade == "perfect":
		_last_perfect = true
		_streak += 1
		_sound("perfect", 1)
		_cheer()
	_back_to_ready(RESULT_SECONDS)


## Back to "ready to cast" after a short pause, so the result can be seen.
func _back_to_ready(delay := 0.0) -> void:
	# Still holding Pull as the reel ends: letting go mustn't count as a tap.
	if _held or main_button.button_pressed:
		_swallow_tap = true
	_clear()
	main_button.disabled = true
	_after(delay, func() -> void:
		bar.hide()
		_set_phase("ready"))


# --- Fanfare ---------------------------------------------------------------

## The landed fish flips up out of the water where the bait was, turning in
## quarter turns, and is gone at the top of its jump.
func _leap(icon: Texture2D) -> void:
	var px := view.size.x / 96.0
	var at: Vector2 = view.global_position + pond.bait_at() * px - global_position
	var fish := TextureRect.new()
	fish.texture = icon
	fish.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	fish.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	fish.size = Vector2(44, 44)
	fish.pivot_offset = fish.size / 2
	fish.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(fish)
	var rise: float = pond.bait_at().y * px + 90
	var frames := 8
	var t := fish.create_tween()
	for i in frames + 1:
		var k := float(i) / frames
		var up := roundf(rise * (1 - (1 - k) * (1 - k)))
		t.tween_callback(func() -> void:
			fish.position = at - fish.size / 2 - Vector2(0, up)
			fish.rotation = deg_to_rad(i * 90)
			fish.scale = Vector2.ONE * (0.6 if k < 0.2 else 1.0)
			fish.modulate.a = 0.0 if i == frames else 1.0)
		t.tween_interval(LEAP_SECONDS / frames)
	t.tween_callback(fish.queue_free)


## "Perfect!" pops up over the pond, with the count of perfects in a row.
func _cheer() -> void:
	%StreakLabel.text = "%d in a row!" % _streak
	%StreakLabel.visible = _streak > 1
	cheer.show()
	cheer.modulate.a = 1.0
	cheer.reset_size()
	cheer.position = Vector2((fill.size.x - cheer.size.x) / 2, fill.size.y * 0.38 - cheer.size.y / 2)
	cheer.pivot_offset = cheer.size / 2
	# Pops in big, settles, holds, then blinks away, in hard steps.
	var t := cheer.create_tween()
	for s in [[0.0, 0.6, 1.0], [0.09, 1.25, 1.0], [0.09, 1.0, 1.0], [0.7, 1.0, 0.0], [0.07, 1.0, 1.0], [0.07, 1.0, 0.0]]:
		t.tween_interval(s[0])
		t.tween_callback(func() -> void:
			cheer.scale = Vector2.ONE * s[1]
			cheer.modulate.a = s[2])
	t.tween_callback(cheer.hide)


## In the web build, shows the phase and the dot to the page, so the
## recording scripts can tell when to reel in and when to pull.
func _tell_page() -> void:
	if OS.has_feature("web"):
		var r := [_reel.marker, _reel.center] if not _reel.is_empty() else []
		JavaScriptBridge.eval("window.fishing = %s" % JSON.stringify({"phase": phase, "reel": r}))


func _sound(id: String, player := 0) -> void:
	_players[player].stream = SOUNDS[id]
	_players[player].play()
