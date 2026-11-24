extends Control
## The map: the island as one full-screen pixel picture, with round bubbles
## over places where something is waiting and the pet at home. A tap on a
## place goes there, a hold shows its name, and the Backyard zooms into its
## own close-up. A port of src/ui/map.ts (plain maps only). The places, tap
## shapes and bubble points come from data/maps/*.json, which
## tools/import_map.py makes from the web game's map files.

signal go_home
signal say(text: String)
## The pond was tapped: go fishing.
signal fish

const SEA := Color8(63, 108, 186)
const HOLD := 0.45
## What each place's bubble shows in this prototype (the web game works it
## out from what's waiting there).
const BUBBLES := {
	"island": {"pond": "fish", "fields": "dig", "backyard": "water", "friends": "mail"},
	"backyard": {"garden": "water", "workshop": "project", "hive": "honey"},
}
## Buildings drawn over the base picture (built in this prototype).
const BUILT := ["workshop"]
const PET_SIZE := 30.0

@onready var stage: Control = $Stage
@onready var base: TextureRect = $Stage/Base
@onready var extras: Control = $Stage/Extras
@onready var marks: Control = $Marks
@onready var sign_label: Label = %SignText
@onready var back: Button = %Back
@onready var tip: PanelContainer = %Tip

var map_id := "island"
var file: Dictionary
var _scale := 2.0
var _press_at := -1.0
var _press_area := ""
var _held := false
var _busy := false


func _ready() -> void:
	$Sea.color = SEA
	stage.gui_input.connect(_on_stage_input)
	%Home.pressed.connect(func() -> void: go_home.emit())
	back.pressed.connect(zoom_out)
	resized.connect(_layout)
	_show("island")


func open() -> void:
	_show("island")
	visible = true
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.2)


func close() -> void:
	var t := create_tween()
	t.tween_property(self, "modulate:a", 0.0, 0.18)
	t.tween_callback(hide)


func _show(id: String) -> void:
	map_id = id
	file = JSON.parse_string(FileAccess.get_file_as_string("res://data/maps/%s.json" % id))
	var night: bool = file.night and Game.is_night()
	base.texture = load("res://art/map/%s%s.png" % [id, "-night" if night else ""])
	for c in extras.get_children():
		c.queue_free()
	for e in file.extras:
		if e.id in BUILT:
			var r := TextureRect.new()
			r.texture = load("res://art/map/%s-x-%s.png" % [id, e.id])
			r.mouse_filter = Control.MOUSE_FILTER_IGNORE
			extras.add_child(r)
	sign_label.text = "Map" if id == "island" else "Backyard"
	back.visible = file.back != null
	tip.hide()
	_layout()


## The picture fills the width (2x on a 390-wide phone) and sits in the
## middle of the screen, on the sea.
func _layout() -> void:
	if file.is_empty() or size.x <= 0:
		return
	var w: float = file.width
	var h: float = file.height
	_scale = size.x / w
	stage.size = Vector2(w, h)
	base.size = stage.size
	for c in extras.get_children():
		c.size = stage.size
	stage.scale = Vector2.ONE * _scale
	stage.pivot_offset = Vector2.ZERO
	stage.position = _origin()
	_place_marks()


## Where the picture's top left corner is on screen.
func _origin() -> Vector2:
	return Vector2(0, (size.y - float(file.height) * _scale) / 2)


func _to_screen(p: Array) -> Vector2:
	return _origin() + Vector2(p[0], p[1]) * _scale


## The bubbles (bobbing gently) and the pet at home.
func _place_marks() -> void:
	for c in marks.get_children():
		c.queue_free()
	var icons: Dictionary = BUBBLES.get(map_id, {})
	for a in file.areas:
		if icons.has(a.id):
			var b := TextureButton.new()
			b.texture_normal = load("res://art/map/bubbles/%s.svg" % icons[a.id])
			b.ignore_texture_size = true
			b.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
			b.size = Vector2(46, 56)
			b.pivot_offset = Vector2(23, 56)
			var at := _to_screen(a.label) - Vector2(23, 56)
			b.position = at
			b.button_down.connect(_press.bind(a.id))
			b.button_up.connect(_release)
			marks.add_child(b)
			var bob := b.create_tween().set_loops()
			bob.tween_property(b, "position:y", at.y - 3, 1.2).set_trans(Tween.TRANS_SINE)
			bob.tween_property(b, "position:y", at.y, 1.2).set_trans(Tween.TRANS_SINE)
		if a.id == "home":
			marks.add_child(_pet_marker(_to_screen(a.pin)))


## The pet's first idle frame with its face on, about 30 pixels across.
func _pet_marker(at: Vector2) -> Control:
	var look := Game.look()
	var holder := Control.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.size = Vector2(PET_SIZE, PET_SIZE)
	holder.position = at - Vector2(PET_SIZE * 0.5, PET_SIZE * 0.85)
	var k := PET_SIZE / 32.0
	var body := TextureRect.new()
	body.texture = look.frames.get_frame_texture(&"idle", 0)
	body.size = Vector2(PET_SIZE, PET_SIZE)
	body.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(body)
	if look.face_frames:
		var face := TextureRect.new()
		face.texture = look.face_frames.get_frame_texture(&"content", 0)
		face.size = Vector2(PET_SIZE, PET_SIZE)
		face.position = Vector2(look.face_point - Vector2i(16, 18)) * k
		face.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		face.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(face)
	var hop := holder.create_tween().set_loops()
	hop.tween_interval(1.6)
	hop.tween_property(holder, "position:y", holder.position.y - 4, 0.12).set_ease(Tween.EASE_OUT)
	hop.tween_property(holder, "position:y", holder.position.y, 0.16).set_ease(Tween.EASE_IN)
	return holder


# --- Taps and holds ---------------------------------------------------------

func _on_stage_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT):
		return
	if event.pressed:
		_press(_area_at(event.position))
	else:
		_release()


func _area_at(p: Vector2) -> String:
	var x := int(p.x)
	var y := int(p.y)
	# Later places are drawn on top, so they win.
	var found := ""
	for a in file.areas:
		for r in a.rows:
			if r[1] == y and x >= r[0] and x < r[0] + r[2]:
				found = a.id
	return found


func _press(area: String) -> void:
	_press_area = area
	_held = false
	_press_at = Time.get_ticks_msec() / 1000.0
	if area == "":
		return
	await get_tree().create_timer(HOLD).timeout
	if _press_at > 0 and _press_area == area and not _held:
		_held = true
		_show_tip(area, _area(area).name)


func _release() -> void:
	var area := _press_area
	_press_at = -1.0
	if _held:
		_held = false
		return
	if area == "":
		# A tap on the sea in the Backyard goes back out to the island.
		if file.back != null:
			zoom_out()
		else:
			tip.hide()
		return
	_activate(area)


func _area(id: String) -> Dictionary:
	for a in file.areas:
		if a.id == id:
			return a
	return {}


func _activate(id: String) -> void:
	if _busy:
		return
	var a := _area(id)
	var opens: String = a.opens
	if opens == "home":
		go_home.emit()
	elif opens == "map:backyard":
		zoom_into(id, "backyard")
	elif opens == "pond":
		fish.emit()
	else:
		_show_tip(id, "%s isn't in this prototype yet." % a.name)


func _show_tip(id: String, text: String) -> void:
	var a := _area(id)
	%TipText.text = text
	tip.visible = true
	tip.size = Vector2.ZERO
	tip.reset_size()
	var at := _to_screen(a.label)
	tip.position = Vector2(clampf(at.x - tip.size.x / 2, 12, size.x - 12 - tip.size.x), at.y - 70 - tip.size.y)
	tip.modulate.a = 0.0
	create_tween().tween_property(tip, "modulate:a", 1.0, 0.12)


# --- Zooming between the island and the Backyard ---------------------------

func zoom_into(id: String, to: String) -> void:
	_busy = true
	tip.hide()
	var a := _area(id)
	var box: Array = a.box
	stage.pivot_offset = Vector2(box[0] + box[2] / 2.0, box[1] + box[3] / 2.0)
	_layout_with_pivot()
	var out := create_tween().set_parallel()
	out.tween_property(stage, "scale", Vector2.ONE * _scale * 2.6, 0.34).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	out.tween_property(stage, "modulate:a", 0.0, 0.34)
	marks.modulate.a = 0.0
	await out.finished
	_show(to)
	stage.pivot_offset = stage.size / 2
	_layout_with_pivot()
	stage.scale = Vector2.ONE * _scale * 0.9
	var t := create_tween().set_parallel()
	t.tween_property(stage, "scale", Vector2.ONE * _scale, 0.26).set_ease(Tween.EASE_OUT)
	t.tween_property(stage, "modulate:a", 1.0, 0.26)
	t.tween_property(marks, "modulate:a", 1.0, 0.26)
	await t.finished
	_busy = false


func zoom_out() -> void:
	if _busy or file.back == null:
		return
	_busy = true
	var from := map_id
	var t := create_tween().set_parallel()
	t.tween_property(stage, "modulate:a", 0.0, 0.2)
	t.tween_property(marks, "modulate:a", 0.0, 0.2)
	await t.finished
	_show(file.back)
	var there: Array = []
	for a in file.areas:
		if a.opens == "map:" + from:
			there = a.box
	stage.pivot_offset = Vector2(there[0] + there[2] / 2.0, there[1] + there[3] / 2.0) if there else stage.size / 2
	_layout_with_pivot()
	stage.scale = Vector2.ONE * _scale * 2.6
	var back_in := create_tween().set_parallel()
	back_in.tween_property(stage, "scale", Vector2.ONE * _scale, 0.34).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	back_in.tween_property(stage, "modulate:a", 1.0, 0.34)
	back_in.tween_property(marks, "modulate:a", 1.0, 0.34)
	await back_in.finished
	_busy = false


## Places the stage like _layout does, but scaled around its pivot.
func _layout_with_pivot() -> void:
	var p := stage.pivot_offset
	# A Control scales around position + pivot_offset.
	stage.position = _origin() - p + p * _scale
