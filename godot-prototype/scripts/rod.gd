extends Node2D
## The fishing rod the pet holds while fishing (a port of drawFishing in
## src/render/canvas.ts). The line runs from the tip straight down out of
## the room into the pond below. A "!" pops up when a fish bites, and the
## tip shakes while reeling in. Drawn in the old room's 64x48 pixels.

const COCOA := Color("#8a5a44")
const INK := Color("#2b2140")
const ROSE := Color("#e05a7a")
## The pixel column the line hangs down (the pond lines its own up under it).
const LINE_X := 51
const TIP_Y := 21

## off, ready, waiting, nibble, bite or reeling.
var phase := "off":
	set(v):
		phase = v
		visible = v != "off"
		queue_redraw()


func _process(_delta: float) -> void:
	if phase in ["bite", "reeling"]:
		queue_redraw()


func _draw() -> void:
	var ms := Time.get_ticks_msec()
	var shake := (ms / 80) % 2 if phase == "reeling" else 0
	for i in 9:
		draw_rect(Rect2(42 + i, 29 - i + (shake if i > 5 else 0), 1, 1), COCOA)
	if phase == "ready":
		return
	var tip := TIP_Y + shake
	draw_rect(Rect2(LINE_X, tip, 1, 48 - tip), INK)
	if phase == "bite" and (ms / 150) % 2 == 0:
		draw_rect(Rect2(LINE_X + 4, tip - 2, 2, 5), ROSE)
		draw_rect(Rect2(LINE_X + 4, tip + 4, 2, 2), ROSE)
