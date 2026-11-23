@tool
extends Node2D
## The pet's room, 64 x 48 pixels: cream wallpaper, a window (sun by day,
## moon by night), wood panelling and a plank floor. A port of drawWall,
## drawWindow and drawFloor from src/render/. It's a @tool script, so the
## room shows in the editor too.

const W := 64
const H := 48
const FLOOR_Y := 34
const WAINSCOT_H := 8
const WINDOW := Rect2i(6, 6, 14, 12)

const INK := Color("#2b2140")
const PLUM := Color("#5b3f6e")
const LAVENDER := Color("#d9c8ee")
const CREAM := Color("#fff7ec")
const WHITE := Color("#ffffff")
const BUTTER := Color("#ffe596")
const SKY := Color("#9ad3f0")
const COCOA := Color("#8a5a44")
const WOOD_DEEP := Color("#3e2620")
const WOOD_DARK := Color("#7a4e3a")
const WOOD_MID := Color("#a8714f")
const WOOD_LIGHT := Color("#c99068")
const WOOD_HI := Color("#e2b48a")

@export var night := false:
	set(v):
		if v != night:
			night = v
			queue_redraw()

var _twinkle := 0


func _process(_delta: float) -> void:
	var t := int(Time.get_ticks_msec() / 700) % 2
	if night and t != _twinkle:
		_twinkle = t
		queue_redraw()


func _px(x: int, y: int, w: int, h: int, c: Color) -> void:
	draw_rect(Rect2(x, y, w, h), c)


func _draw() -> void:
	_draw_wall()
	_draw_window()
	_draw_wainscot(FLOOR_Y - WAINSCOT_H)
	_draw_floor(FLOOR_Y)


func _draw_wall() -> void:
	var base := LAVENDER if night else CREAM
	var light := Color("#cfbce8") if night else Color("#f5e8d6")
	var dark := Color("#c4aee0") if night else Color("#ead5bf")
	_px(0, 0, W, FLOOR_Y, base)
	# A little sprig every few pixels.
	for y in FLOOR_Y:
		for x in W:
			var cx := x % 10
			var cy := y % 12
			if cx == 5 and (cy == 2 or cy == 4):
				_px(x, y, 1, 1, dark)
			elif ((cx == 4 or cx == 6) and cy == 3) or (cx == 0 and cy == 8):
				_px(x, y, 1, 1, light)


func _draw_window() -> void:
	var r := WINDOW
	_px(r.position.x - 1, r.position.y - 1, r.size.x + 2, r.size.y + 2, COCOA)
	_px(r.position.x, r.position.y, r.size.x, r.size.y, PLUM if night else SKY)
	var x := r.position.x
	var y := r.position.y
	if night:
		_px(x + 10, y + 1, 2, 1, BUTTER)
		_px(x + 9, y + 2, 2, 2, BUTTER)
		_px(x + 10, y + 4, 2, 1, BUTTER)
		_px(x + 2, y + 3 + _twinkle, 1, 1, WHITE)
		_px(x + 5, y + 8, 1, 1, WHITE)
		_px(x + 11, y + 9 - _twinkle, 1, 1, WHITE)
	else:
		_px(x + 9, y + 2, 3, 3, BUTTER)
		_px(x + 2, y + 7, 5, 2, WHITE)
		_px(x + 3, y + 6, 2, 1, WHITE)
	_px(x + r.size.x / 2, y, 1, r.size.y, COCOA)
	_px(x, y + r.size.y / 2, r.size.x, 1, COCOA)


func _draw_wainscot(y: int) -> void:
	_px(0, y, W, WAINSCOT_H, WOOD_MID)
	_px(0, y, W, 1, WOOD_HI)
	_px(0, y + 1, W, 1, WOOD_LIGHT)
	_px(0, y + 2, W, 1, WOOD_DARK)
	for x in range(2, W, 16):
		_px(x, y + 3, 12, 1, WOOD_DARK)
		_px(x, y + 3, 1, WAINSCOT_H - 4, WOOD_DARK)
		_px(x + 1, y + WAINSCOT_H - 2, 11, 1, WOOD_LIGHT)
		_px(x + 11, y + 4, 1, WAINSCOT_H - 6, WOOD_LIGHT)


func _draw_floor(y: int) -> void:
	_px(0, y, W, 1, WOOD_DEEP)
	var seed := 7
	var row := y + 1
	while row < H:
		seed = (seed * 1103515245 + 12345) % 2147483648
		var x := -int(floor(seed / 2147483648.0 * 16))
		while x < W:
			seed = (seed * 1103515245 + 12345) % 2147483648
			var length := 14 + int(floor(seed / 2147483648.0 * 14))
			seed = (seed * 1103515245 + 12345) % 2147483648
			_px(x, row, length, 5, WOOD_LIGHT if seed / 2147483648.0 < 0.25 else WOOD_MID)
			_px(x, row, length, 1, WOOD_HI)
			_px(x, row + 5, length, 1, WOOD_DARK)
			_px(x + length - 1, row, 1, 5, WOOD_DARK)
			x += length
		row += 6
