extends Node2D
## Little Zs floating up from a sleeping pet (drawSleepZs in the web game).

const EVERY := 1.33
const RISE := 2.4
const CREAM := Color("#fff7ec")


func _process(_delta: float) -> void:
	if visible:
		queue_redraw()


func _draw() -> void:
	var now := Time.get_ticks_msec() / 1000.0
	var newest := int(floor(now / EVERY))
	for n in [newest - 1, newest]:
		var t: float = (now - n * EVERY) / RISE
		if t >= 1.0:
			continue
		var i := posmod(n, 3)
		var a := t / 0.15 if t < 0.15 else 1.0 - (t - 0.15) / 0.85
		var zx := 4 + roundi(t * 8 + sin(t * 7 + i) * 1.2)
		var zy := 2 - roundi(t * 14)
		var c := Color(CREAM, a)
		var big := i == 0 and t > 0.4
		var s := 4 if big else 3
		draw_rect(Rect2(zx, zy, s, 1), c)
		for k in range(1, s - 1):
			draw_rect(Rect2(zx + s - 1 - k, zy + k, 1, 1), c)
		draw_rect(Rect2(zx, zy + s - 1, s, 1), c)
