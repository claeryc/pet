@tool
extends Control
## One stat's bar: 10 segments, green when fine and rose when low. The value
## slides to its new level instead of jumping.

const GOOD := Color("#6cc19a")
const GOOD_DARK := Color("#4a9a76")
const GOOD_LIGHT := Color("#c2f2d6")
const LOW := Color("#e05a7a")
const LOW_DARK := Color("#b23a5a")
const LOW_LIGHT := Color("#fbc2cf")
const EMPTY := Color("#efe6f7")
const EMPTY_SHADE := Color("#d3c2e6")
const TRACK := Color("#a68bc9")
const SEGMENTS := 10

@export_range(0, 100) var value := 80.0:
	set(v):
		value = v
		queue_redraw()
@export var low_below := 30.0

var _tween: Tween


func _init() -> void:
	custom_minimum_size = Vector2(0, 18)


## Slides to `v` over a moment.
func show_value(v: float) -> void:
	if is_equal_approx(v, value):
		return
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "value", v, 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	var track := StyleBoxFlat.new()
	track.bg_color = EMPTY
	track.border_color = TRACK
	track.set_border_width_all(2)
	track.set_corner_radius_all(6)
	draw_style_box(track, r)
	var inner := r.grow(-3)
	var low := value < low_below
	var fill := LOW if low else GOOD
	var dark := LOW_DARK if low else GOOD_DARK
	var light := LOW_LIGHT if low else GOOD_LIGHT
	var seg_w := inner.size.x / SEGMENTS
	var filled := inner.size.x * clampf(value / 100.0, 0.0, 1.0)
	# The empty part's shading, then the fill, then the lines between segments.
	draw_rect(Rect2(inner.position + Vector2(0, inner.size.y - 2), Vector2(inner.size.x, 2)), EMPTY_SHADE)
	if filled > 0.0:
		draw_rect(Rect2(inner.position, Vector2(filled, inner.size.y)), fill)
		draw_rect(Rect2(inner.position, Vector2(filled, 2)), light)
		draw_rect(Rect2(inner.position + Vector2(0, inner.size.y - 2), Vector2(filled, 2)), dark)
	for i in range(1, SEGMENTS):
		var x := inner.position.x + seg_w * i
		draw_rect(Rect2(x - 0.5, inner.position.y, 1, inner.size.y), Color(dark, 0.35) if x < inner.position.x + filled else EMPTY_SHADE)
