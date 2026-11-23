extends Control
## The home screen: shows the pet and its stats, and passes button presses
## on to Game. The look of everything is in scenes/main.tscn and
## data/theme.tres; this script only fills it in.

const T: Tuning = preload("res://data/tuning.tres")
const STAT_ICONS := {
	"hunger": preload("res://art/icons/hunger.png"),
	"happiness": preload("res://art/icons/happiness.png"),
	"health": preload("res://art/icons/health.png"),
	"energy": preload("res://art/icons/energy.png"),
}
const LIGHTS_OFF: AudioStream = preload("res://audio/lights-off.mp3")
const LIGHTS_ON: AudioStream = preload("res://audio/lights-on.mp3")
const GOOD_TEXT := Color("#4a9a76")
const BAD_TEXT := Color("#b23a5a")

@onready var room_view: TextureRect = %RoomView
@onready var viewport: SubViewport = %RoomViewport
@onready var room: Node2D = %Room
@onready var pet: Node2D = %Pet
@onready var dim: ColorRect = %Dim
@onready var overlay: Control = %Overlay
@onready var bars := {"hunger": %HungerBar, "happiness": %HappinessBar, "health": %HealthBar, "energy": %EnergyBar}
@onready var drawer: PanelContainer = %Drawer
@onready var drawer_list: VBoxContainer = %List

var _drawer_kind := -1
var _last_tap := -10.0
var _toast_tween: Tween


func _ready() -> void:
	room_view.texture = viewport.get_texture()
	# The room fills the card's width and keeps its 4:3 shape.
	var box: Control = room_view.get_parent()
	box.resized.connect(func() -> void:
		box.custom_minimum_size.y = floorf(box.size.x * 0.75))
	room_view.gui_input.connect(_on_room_input)
	%Feed.pressed.connect(_toggle_drawer.bind(CareOption.Kind.FOOD))
	%Play.pressed.connect(_toggle_drawer.bind(CareOption.Kind.PLAY))
	%Lights.pressed.connect(_on_lights)
	%Close.pressed.connect(close_drawer)
	%Shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed:
			close_drawer())
	%NextPet.pressed.connect(Game.next_pet)
	%Speed.pressed.connect(Game.next_speed)
	%Reset.pressed.connect(Game.reset)
	Game.changed.connect(_refresh)
	Game.cared.connect(_on_cared)
	Game.refused.connect(_on_refused)
	_refresh()


func _refresh() -> void:
	var s: Dictionary = Game.state
	if pet.look != Game.look():
		pet.look = Game.look()
	for k in bars:
		bars[k].show_value(s.stats[k])
	%GoldLabel.text = str(int(s.gold))
	room.night = Game.is_night()
	dim.visible = s.asleep
	pet.set_mood(PetRules.look(s, T), PetRules.mood_face(s, T, Game.idle_seconds()))
	%Status.text = _status()
	%Lights.text = "Wake" if s.asleep else "Sleep"
	%Speed.text = "%d×" % Game.speed
	if _drawer_kind >= 0:
		_fill_drawer()


func _status() -> String:
	var s: Dictionary = Game.state
	var n := Game.pet_name()
	if s.asleep:
		return "%s is fast asleep. Shh!" % n
	if s.stats.health < T.sick_below:
		return "%s doesn't feel well." % n
	if s.stats.hunger < T.low_stat:
		return "%s is hungry." % n
	if s.stats.happiness < T.low_stat:
		return "%s feels lonely. Play together?" % n
	if s.stats.energy < T.sleepy_below:
		return "%s can hardly keep its eyes open." % n
	if s.stats.happiness >= T.cheerful_happiness:
		return "%s is happy to see you!" % n
	return "%s is doing fine." % n


# --- Tapping the pet cuddles it ----------------------------------------

func _on_room_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		return
	var p: Vector2 = event.position / room_view.size * Vector2(64, 48)
	if p.x < 12 or p.x > 52 or p.y < 4 or p.y > 44:
		return
	var now := Time.get_ticks_msec() / 1000.0
	if now - _last_tap < T.tap_cooldown:
		return
	_last_tap = now
	Game.care(Game.options(CareOption.Kind.PLAY)[0])


# --- What happened -------------------------------------------------------

func _on_cared(option: CareOption, gains: Dictionary) -> void:
	close_drawer()
	%Sfx.stream = option.sound
	%Sfx.play()
	if option.kind == CareOption.Kind.FOOD:
		pet.eat(option.icon, T.eating_seconds, T.bites)
	else:
		pet.react(T.reaction_seconds)
	var i := 0
	for k in gains:
		_float_gain(k, gains[k], i)
		i += 1


func _on_refused(option: CareOption, reason: String) -> void:
	var n := Game.pet_name()
	match reason:
		"asleep":
			toast("%s is asleep. Let it rest!" % n)
		"none_left":
			toast("No %s left." % option.display_name.to_lower())
		"too_tired":
			toast("%s is too tired to play." % n)


func _on_lights() -> void:
	close_drawer()
	Game.toggle_lights()
	%Sfx.stream = LIGHTS_OFF if Game.state.asleep else LIGHTS_ON
	%Sfx.play()


## A little "+10" bubble that floats up from the pet and fades.
func _float_gain(stat: String, amount: int, index: int) -> void:
	var chip := _chip(stat, amount)
	overlay.add_child(chip)
	chip.reset_size()
	var start := Vector2(0.5, 0.2) * overlay.size - chip.size / 2 + Vector2((index - 0.5) * 64, 0)
	chip.position = start
	chip.modulate.a = 0.0
	var t := chip.create_tween().set_parallel()
	t.tween_property(chip, "modulate:a", 1.0, 0.15)
	t.tween_property(chip, "position:y", start.y - 36, 1.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	t.tween_property(chip, "modulate:a", 0.0, 0.4).set_delay(0.9)
	t.chain().tween_callback(chip.queue_free)


func _chip(stat: String, amount: int) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.theme_type_variation = &"ChipGood" if amount > 0 else &"ChipBad"
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 3)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.add_child(row)
	var icon := TextureRect.new()
	icon.texture = STAT_ICONS[stat]
	icon.custom_minimum_size = Vector2(12, 12)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var label := Label.new()
	label.text = ("+%d" if amount > 0 else "%d") % amount
	label.add_theme_font_size_override("font_size", 13)
	label.add_theme_color_override("font_color", GOOD_TEXT if amount > 0 else BAD_TEXT)
	row.add_child(label)
	return chip


func toast(text: String) -> void:
	var box: PanelContainer = %Toast
	%Text.text = text
	box.visible = true
	box.reset_size()
	box.position = Vector2((size.x - box.size.x) / 2, size.y - 150 - box.size.y)
	box.modulate.a = 1.0
	if _toast_tween:
		_toast_tween.kill()
	_toast_tween = create_tween()
	_toast_tween.tween_interval(1.8)
	_toast_tween.tween_property(box, "modulate:a", 0.0, 0.3)
	_toast_tween.tween_callback(box.hide)


# --- The Feed and Play drawers --------------------------------------------

func _toggle_drawer(kind: CareOption.Kind) -> void:
	if _drawer_kind == kind:
		close_drawer()
		return
	_drawer_kind = kind
	%Close.text = "Feed" if kind == CareOption.Kind.FOOD else "Play"
	_fill_drawer()
	drawer.visible = true
	%Shade.visible = true
	drawer.reset_size()
	var w := size.x - 32
	drawer.size = Vector2(w, 0)
	drawer.reset_size()
	drawer.size.x = w
	var target := size.y - 16 - drawer.size.y
	drawer.position = Vector2(16, size.y)
	create_tween().tween_property(drawer, "position:y", target, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func close_drawer() -> void:
	if _drawer_kind < 0:
		return
	_drawer_kind = -1
	%Shade.visible = false
	var t := create_tween()
	t.tween_property(drawer, "position:y", size.y, 0.18).set_ease(Tween.EASE_IN)
	t.tween_callback(drawer.hide)


func _fill_drawer() -> void:
	for c in drawer_list.get_children():
		drawer_list.remove_child(c)
		c.queue_free()
	for o in Game.options(_drawer_kind):
		drawer_list.add_child(_option_row(o))


func _option_row(o: CareOption) -> Button:
	var b := Button.new()
	b.theme_type_variation = &"OptionRow"
	b.custom_minimum_size = Vector2(0, 54)
	b.pressed.connect(Game.care.bind(o))
	var blocked := PetRules.blocked(Game.state, o) != ""
	if blocked:
		b.modulate.a = 0.55
	var row := HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 10)
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(row)
	var icon := TextureRect.new()
	icon.texture = o.icon
	icon.custom_minimum_size = Vector2(30, 30)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var names := VBoxContainer.new()
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	names.add_theme_constant_override("separation", -2)
	names.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(names)
	var title := Label.new()
	title.text = o.display_name
	title.add_theme_font_size_override("font_size", 15)
	names.add_child(title)
	if o.kind == CareOption.Kind.FOOD:
		var count := Label.new()
		count.theme_type_variation = &"Small"
		count.text = "× %d" % Game.count(o)
		names.add_child(count)
	var effects := o.effects()
	for k in effects:
		var chip := _chip(k, effects[k])
		chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(chip)
	return b
