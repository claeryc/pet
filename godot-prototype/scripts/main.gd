extends Control
## The home screen, laid out like the web game's redesign: a tall room with
## the needs pinned to its top, the dock (Feed, Map, "···"), the Feed and
## Play sheets that fold the room up to make space, and the pop-up menu.
## The look of everything is in scenes/main.tscn and data/theme.tres; this
## script fills it in and passes button presses on to Game.

const T: Tuning = preload("res://data/tuning.tres")
const STAT_ICONS := {
	"hunger": preload("res://art/icons/hunger.png"),
	"happiness": preload("res://art/icons/happiness.png"),
	"health": preload("res://art/icons/health.png"),
	"energy": preload("res://art/icons/energy.png"),
}
const NEED_SHEETS := {
	"hunger": preload("res://art/icons/need-hunger.png"),
	"happiness": preload("res://art/icons/need-happiness.png"),
	"health": preload("res://art/icons/need-health.png"),
	"energy": preload("res://art/icons/need-energy.png"),
}
## The pop-up menu, top to bottom: icon, label, and whether this prototype
## has it ("play" works, the rest say they're not ported yet).
const MENU := [
	["shop", "Shop", preload("res://art/icons/shop.png")],
	["skills", "Skills", preload("res://art/icons/skills.png")],
	["messages", "Messages", preload("res://art/icons/letter.png")],
	["journal", "Journal", preload("res://art/icons/journal.png")],
	["collection", "Collection", preload("res://art/icons/collection.png")],
	["family", "Family", preload("res://art/icons/familyTree.png")],
	["play", "Play", preload("res://art/icons/cuddle.png")],
	[],
	["guide", "Guide", preload("res://art/icons/guide.png")],
	["settings", "Settings", preload("res://art/icons/settings.png")],
	[],
	["next_pet", "Prototype: next pet", null],
	["speed", "Prototype: time 1×", null],
	["reset", "Prototype: reset pet", null],
]
const FILTERS := {"All": [], "FruitVeg": ["fruit", "veg"], "Sweets": ["sweet"]}
const LIGHTS_OFF: AudioStream = preload("res://audio/lights-off.mp3")
const LIGHTS_ON: AudioStream = preload("res://audio/lights-on.mp3")
const SHEET_OPEN: AudioStream = preload("res://audio/sheet-open.mp3")
const SHEET_CLOSE: AudioStream = preload("res://audio/sheet-close.mp3")
const GOOD_TEXT := Color("#4a9a76")
const BAD_TEXT := Color("#b23a5a")
const DOCK_TOP := 84.0 # the dock's height and the gap above it

@onready var room_card: PanelContainer = %RoomCard
@onready var room_view: TextureRect = %RoomView
@onready var viewport: SubViewport = %RoomViewport
@onready var world: Node2D = %World
@onready var room: Node2D = %Room
@onready var pet: Node2D = %Pet
@onready var dim: ColorRect = %Dim
@onready var fx: Control = %Fx
@onready var sheet: PanelContainer = %Sheet
@onready var pop: PanelContainer = %Pop
@onready var map_screen: Control = %Map
@onready var fishing: Control = %Fishing
@onready var rod: Node2D = %Rod

## How far the room is folded up for a sheet: 0 = full height, 1 = 4:3.
var fold := 0.0:
	set(v):
		fold = v
		_layout()
## The open sheet (FOOD or PLAY), or -1.
var _sheet_kind := -1
var _picked: CareOption
var _filter: Array = []
var _last_tap := -10.0
var _toast_tween: Tween
var _fold_tween: Tween
var _steps := {}


func _ready() -> void:
	room_view.texture = viewport.get_texture()
	room_view.resized.connect(_fit_room)
	room_view.gui_input.connect(_on_room_input)
	resized.connect(_layout)
	%Feed.pressed.connect(_toggle_sheet.bind(CareOption.Kind.FOOD))
	%MapButton.pressed.connect(_open_map)
	%More.pressed.connect(_on_more)
	%Moon.pressed.connect(_on_lights)
	%Go.pressed.connect(func() -> void:
		if _picked:
			Game.care(_picked))
	%Cook.pressed.connect(toast.bind("Cooking isn't in this prototype yet."))
	for b: Button in %Filters.get_children():
		b.pressed.connect(func() -> void:
			_filter = FILTERS[b.name]
			_fill_sheet())
	map_screen.go_home.connect(_close_map)
	map_screen.say.connect(toast)
	map_screen.fish.connect(_start_fishing)
	fishing.say.connect(toast)
	fishing.phase_changed.connect(func(p: String) -> void: rod.phase = p)
	fishing.exited.connect(_stop_fishing)
	_build_menu()
	Game.changed.connect(_refresh)
	Game.cared.connect(_on_cared)
	Game.refused.connect(_on_refused)
	_refresh()


func _refresh() -> void:
	var s: Dictionary = Game.state
	if pet.look != Game.look():
		pet.look = Game.look()
	for k in NEED_SHEETS:
		_show_need(k, s.stats[k])
	%GoldLabel.text = str(int(s.gold))
	room.night = Game.is_night()
	dim.visible = s.asleep
	pet.set_mood(PetRules.look(s, T), PetRules.mood_face(s, T, Game.idle_seconds()))
	_menu_row("speed").text = "Prototype: time %d×" % Game.speed
	if _sheet_kind >= 0:
		_fill_sheet()


## A need's icon shows its level in five steps, and hops when it changes.
func _show_need(stat: String, value: float) -> void:
	var step := clampi(int(value / 20.0), 0, 4)
	if _steps.get(stat) == step:
		return
	var icon: TextureRect = %Needs.get_node("Row/" + stat)
	var atlas := AtlasTexture.new()
	atlas.atlas = NEED_SHEETS[stat]
	atlas.region = Rect2(step * 12, 0, 12, 11)
	icon.texture = atlas
	if _steps.has(stat):
		icon.scale = Vector2.ONE * 1.35
		create_tween().tween_property(icon, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_steps[stat] = step


# --- Layout: the room grows to fill the screen, and folds for a sheet -----

func _layout() -> void:
	var full_bottom := -DOCK_TOP
	var folded_h := (size.x - 32 - 8) * 0.75 + 10
	room_card.offset_bottom = lerpf(full_bottom, -(size.y - 16 - folded_h), fold)
	sheet.offset_top = 16 + folded_h + 12 + (1.0 - fold) * (size.y - folded_h)
	sheet.modulate.a = clampf(fold * 2.0, 0.0, 1.0)
	fishing.place(16 + folded_h + 12)


## The room is 64 pixels wide and as tall as the card allows (48 to 192):
## the extra rows are wall above the old room, like fitRoomHeight.
func _fit_room() -> void:
	var r := room_view.size
	if r.x <= 0:
		return
	var h := clampi(roundi(r.y / r.x * 64.0), 48, 192)
	var top := h - 48
	viewport.size = Vector2i(64, h)
	world.position.y = top
	room.top = top
	dim.position = Vector2(0, -top)
	dim.size = Vector2(64, h)
	# The gold sits on the wall just over the window.
	var px := r.x / 64.0
	%Gold.position = Vector2(4 * px, (top + 1) * px - %Gold.size.y)


func _room_to_screen(p: Vector2) -> Vector2:
	var vs := Vector2(viewport.size)
	var scale := maxf(room_view.size.x / vs.x, room_view.size.y / vs.y)
	return (room_view.size - vs * scale) / 2 + p * scale


# --- Tapping the pet cuddles it -------------------------------------------

func _on_room_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		return
	var vs := Vector2(viewport.size)
	var scale := maxf(room_view.size.x / vs.x, room_view.size.y / vs.y)
	var p: Vector2 = (event.position - (room_view.size - vs * scale) / 2) / scale
	p.y -= world.position.y
	if p.x < 12 or p.x > 52 or p.y < 4 or p.y > 44:
		return
	var now := Time.get_ticks_msec() / 1000.0
	if now - _last_tap < T.tap_cooldown:
		return
	_last_tap = now
	Game.care(Game.options(CareOption.Kind.PLAY)[0])


# --- What happened -------------------------------------------------------

func _on_cared(option: CareOption, gains: Dictionary) -> void:
	_play(option.sound)
	if option.kind == CareOption.Kind.FOOD:
		pet.eat(option.icon, T.eating_seconds, T.bites)
	else:
		pet.react(T.reaction_seconds)
	var i := 0
	for k in gains:
		_float_gain(k, gains[k], i, gains.size())
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
	Game.toggle_lights()
	_play(LIGHTS_OFF if Game.state.asleep else LIGHTS_ON)


func _play(stream: AudioStream) -> void:
	%Sfx.stream = stream
	%Sfx.play()


## A little "+10" chip that floats up from the pet's head and fades.
func _float_gain(stat: String, amount: int, index: int, count: int) -> void:
	var chip := _chip(stat, amount)
	fx.add_child(chip)
	chip.reset_size()
	var head := _room_to_screen(Vector2(32, world.position.y + 8))
	var start := head - chip.size / 2 + Vector2((index - (count - 1) / 2.0) * (chip.size.x + 6), 14)
	chip.position = start
	chip.modulate.a = 0.0
	var t := chip.create_tween().set_parallel()
	t.tween_property(chip, "modulate:a", 1.0, 0.15)
	t.tween_property(chip, "position:y", start.y - 28, 1.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
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
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)
	var label := Label.new()
	label.text = ("+%d" if amount > 0 else "%d") % amount
	label.add_theme_font_size_override("font_size", 13)
	label.add_theme_color_override("font_color", GOOD_TEXT if amount > 0 else BAD_TEXT)
	row.add_child(label)
	return chip


func _place_toast() -> void:
	var box: PanelContainer = %Toast
	%Text.reset_size()
	box.reset_size()
	box.position = Vector2((size.x - box.size.x) / 2, size.y - DOCK_TOP - 24 - box.size.y)


func toast(text: String) -> void:
	var box: PanelContainer = %Toast
	%Text.text = text
	box.visible = true
	box.size = Vector2.ZERO
	box.custom_minimum_size.x = minf(size.x - 64, 320)
	# A wrapping label needs its width before it can work out its height.
	%Text.custom_minimum_size.x = box.custom_minimum_size.x - 32
	_place_toast()
	_place_toast.call_deferred() # again once the text has been laid out
	box.modulate.a = 1.0
	if _toast_tween:
		_toast_tween.kill()
	_toast_tween = create_tween()
	_toast_tween.tween_interval(1.8)
	_toast_tween.tween_property(box, "modulate:a", 0.0, 0.3)
	_toast_tween.tween_callback(box.hide)


# --- The dock: Feed, Map and "···" ----------------------------------------

func _on_more() -> void:
	if _sheet_kind >= 0 or pop.visible:
		close_all()
	else:
		_open_menu()


func _set_more_close(on: bool) -> void:
	%More.text = "×" if on else "···"


func close_all() -> void:
	_close_menu()
	_close_sheet()


func _toggle_sheet(kind: CareOption.Kind) -> void:
	if _sheet_kind == kind:
		close_all()
		return
	_close_menu()
	var was_open := _sheet_kind >= 0
	_sheet_kind = kind
	var options := Game.options(kind)
	if not _picked or _picked.kind != kind:
		_picked = options[0]
	%SheetTitle.text = "Feed" if kind == CareOption.Kind.FOOD else "Play"
	%Cook.visible = kind == CareOption.Kind.FOOD
	%Filters.visible = kind == CareOption.Kind.FOOD
	%Go.text = "Feed" if kind == CareOption.Kind.FOOD else "Play"
	_fill_sheet()
	_set_more_close(true)
	if was_open:
		return
	_play(SHEET_OPEN)
	sheet.visible = true
	_animate_fold(1.0)


func _close_sheet() -> void:
	if _sheet_kind < 0:
		return
	_sheet_kind = -1
	_set_more_close(false)
	_play(SHEET_CLOSE)
	_animate_fold(0.0).tween_callback(sheet.hide)


func _animate_fold(to: float) -> Tween:
	if _fold_tween:
		_fold_tween.kill()
	_fold_tween = create_tween()
	_fold_tween.tween_property(self, "fold", to, 0.32).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	return _fold_tween


func _fill_sheet() -> void:
	var grid: GridContainer = %Grid
	for c in grid.get_children():
		grid.remove_child(c)
		c.queue_free()
	for o in Game.options(_sheet_kind):
		if _sheet_kind == CareOption.Kind.FOOD and not _filter.is_empty():
			if not Array(o.tags).any(func(t: String) -> bool: return t in _filter):
				continue
		grid.add_child(_tile(o))
	_show_pick()


func _tile(o: CareOption) -> Button:
	var b := Button.new()
	b.theme_type_variation = &"Tile"
	b.toggle_mode = true
	b.button_pressed = o == _picked
	b.custom_minimum_size = Vector2(72, 72)
	b.pressed.connect(func() -> void:
		_picked = o
		_fill_sheet())
	if PetRules.blocked(Game.state, o) == "none_left":
		b.modulate.a = 0.5
	var icon := TextureRect.new()
	icon.texture = o.icon
	icon.set_anchors_preset(Control.PRESET_FULL_RECT)
	icon.offset_left = 16
	icon.offset_top = 12
	icon.offset_right = -16
	icon.offset_bottom = -18
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(icon)
	if o.kind == CareOption.Kind.FOOD:
		var count := Label.new()
		count.theme_type_variation = &"Small"
		count.text = "× %d" % Game.count(o)
		count.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT, Control.PRESET_MODE_MINSIZE, 6)
		count.grow_horizontal = Control.GROW_DIRECTION_BEGIN
		count.grow_vertical = Control.GROW_DIRECTION_BEGIN
		count.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(count)
	return b


## The bar along the bottom: the picked food or game, what it does, and Go.
func _show_pick() -> void:
	var o := _picked
	%PickIcon.texture = o.icon
	%PickName.text = o.display_name + ("  × %d" % Game.count(o) if o.kind == CareOption.Kind.FOOD else "")
	var chips: HBoxContainer = %PickChips
	for c in chips.get_children():
		c.queue_free()
	var effects := o.effects()
	for k in effects:
		chips.add_child(_chip(k, effects[k]))
	%Go.disabled = PetRules.blocked(Game.state, o) == "none_left"


# --- The pop-up menu -------------------------------------------------------

func _build_menu() -> void:
	for item in MENU:
		if item.is_empty():
			var line := ColorRect.new()
			line.color = Color("#e6dcf2")
			line.custom_minimum_size = Vector2(0, 2)
			var pad := MarginContainer.new()
			pad.add_theme_constant_override("margin_top", 6)
			pad.add_theme_constant_override("margin_bottom", 6)
			pad.add_child(line)
			%PopList.add_child(pad)
			continue
		var b := Button.new()
		b.name = item[0]
		b.theme_type_variation = &"MenuRow"
		b.text = item[1]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.custom_minimum_size = Vector2(0, 46 if item[2] else 36)
		if item[2]:
			b.icon = item[2]
			b.expand_icon = true
		else:
			b.add_theme_font_size_override("font_size", 14)
			b.add_theme_color_override("font_color", Color("#5b3f6e"))
		b.pressed.connect(_on_menu.bind(item[0], item[1]))
		%PopList.add_child(b)


func _menu_row(id: String) -> Button:
	return %PopList.get_node(id)


func _open_menu() -> void:
	_close_sheet()
	pop.visible = true
	pop.reset_size()
	pop.pivot_offset = pop.size
	pop.scale = Vector2.ONE * 0.85
	pop.modulate.a = 0.0
	var t := create_tween().set_parallel()
	t.tween_property(pop, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(pop, "modulate:a", 1.0, 0.15)
	_set_more_close(true)
	_play(SHEET_OPEN)


func _close_menu() -> void:
	if not pop.visible:
		return
	pop.visible = false
	if _sheet_kind < 0:
		_set_more_close(false)


func _on_menu(id: String, label: String) -> void:
	match id:
		"play":
			_close_menu()
			_toggle_sheet(CareOption.Kind.PLAY)
		"next_pet":
			Game.next_pet()
		"speed":
			Game.next_speed()
		"reset":
			Game.reset()
		_:
			toast("%s isn't in this prototype yet." % label)


# --- The map -----------------------------------------------------------------

func _open_map() -> void:
	close_all()
	map_screen.open()


func _close_map() -> void:
	map_screen.close()


# --- Fishing (scripts/fishing_screen.gd) ----------------------------------

func _start_fishing() -> void:
	map_screen.close()
	if Game.state.asleep:
		toast("%s is asleep. Let it rest!" % Game.pet_name())
		return
	close_all()
	%Dock.hide()
	_animate_fold(1.0).tween_callback(func() -> void:
		fishing.align_line(room_view.global_position.x + _room_to_screen(Vector2(rod.LINE_X + 0.5, 0)).x))
	fishing.start()


func _stop_fishing() -> void:
	_animate_fold(0.0)
	%Dock.show()
