@tool
extends Node2D
## The pet's room: the old 64 x 48 room (cream wallpaper, a window with sun
## or moon, wood panelling, a plank floor) with `top` more rows of wall
## above it on a tall screen, up to a ceiling beam with fairy lights, a
## picture, a clock and a hanging lamp. A port of drawWall, drawWindow,
## drawFloor and drawCeiling from src/render/. The old room's top left is
## (0, 0), so the extra wall is drawn at negative y. It's a @tool script,
## so the room shows in the editor too.

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

const BEAM_H := 4
const LIGHT := Color("#fff4b8")
const GLOW := Color("#f5cf6a")
const BRASS := Color("#d39a3a")
const LEAF := Color("#6cc19a")
const MINT := Color("#a8e6cf")

@export var night := false:
	set(v):
		if v != night:
			night = v
			queue_redraw()
## Rows of wall over the old room.
@export var top := 0:
	set(v):
		if v != top:
			top = v
			queue_redraw()

var _twinkle := 0
var _bulbs := 0


func _process(_delta: float) -> void:
	var ms := Time.get_ticks_msec()
	var t := int(ms / 700) % 2
	var b := int(ms / 900)
	if (night and t != _twinkle) or (top >= 12 and b != _bulbs):
		_twinkle = t
		_bulbs = b
		queue_redraw()


func _px(x: int, y: int, w: int, h: int, c: Color) -> void:
	draw_rect(Rect2(x, y, w, h), c)


func _draw() -> void:
	_draw_wall()
	_draw_window()
	_draw_wainscot(FLOOR_Y - WAINSCOT_H)
	_draw_floor(FLOOR_Y)
	_draw_ceiling()


func _draw_wall() -> void:
	var base := LAVENDER if night else CREAM
	var light := Color("#cfbce8") if night else Color("#f5e8d6")
	var dark := Color("#c4aee0") if night else Color("#ead5bf")
	_px(0, -top, W, FLOOR_Y + top, base)
	# A little sprig every few pixels (the pattern carries on up the wall).
	for y in range(-top, FLOOR_Y):
		for x in W:
			var cx := x % 10
			var cy := posmod(y, 12)
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


func _draw_ceiling() -> void:
	if top < 12:
		return
	var y0 := -top
	_px(0, y0, W, BEAM_H, WOOD_MID)
	_px(0, y0, W, 1, WOOD_LIGHT)
	_px(0, y0 + BEAM_H - 1, W, 1, WOOD_DARK)
	_px(0, y0 + BEAM_H, W, 1, WOOD_DEEP)
	_draw_fairy_lights(y0)
	if top >= 28:
		var py := y0 + maxi(BEAM_H + 8, int(top / 2.0) - 6)
		_draw_frame(7, py)
		_draw_clock(49, py + 4)
		_draw_pendant(37, y0 + BEAM_H + 1, mini(int(top / 3.0), 30))


func _draw_fairy_lights(y0: int) -> void:
	var n := 0
	for loop in [[0, 34], [34, W]]:
		var a: int = loop[0]
		var b: int = loop[1]
		for x in range(a, b):
			var sag := roundi(sin(float(x - a) / (b - a) * PI) * 3)
			_px(x, y0 + BEAM_H + 1 + sag, 1, 1, WOOD_DEEP)
			if (x - a) % 6 == 3:
				var on := (_bulbs + n) % 3 != 0
				n += 1
				var by := y0 + BEAM_H + 2 + sag
				_px(x - 1, by, 3, 1, LIGHT if on else GLOW)
				_px(x, by - 1, 1, 1, GLOW if on else BRASS)
				_px(x, by + 1, 1, 1, GLOW if on else BRASS)
				if on and night:
					_px(x - 1, by - 1, 3, 3, Color(LIGHT, 0.35))


func _draw_pendant(x: int, y: int, drop: int) -> void:
	_px(x, y, 1, drop, WOOD_DEEP)
	var sy := y + drop
	if night:
		_px(x - 6, sy + 4, 13, 8, Color(LIGHT, 0.25))
		_px(x - 4, sy + 12, 9, 3, Color(LIGHT, 0.25))
	_px(x - 1, sy, 3, 1, BRASS)
	_px(x - 2, sy + 1, 5, 1, BUTTER)
	_px(x - 3, sy + 2, 7, 2, BUTTER)
	_px(x - 3, sy + 4, 7, 1, GLOW)
	_px(x - 1, sy + 5, 3, 1, LIGHT)


func _draw_frame(x: int, y: int) -> void:
	_px(x, y, 14, 12, WOOD_DARK)
	_px(x + 1, y + 1, 12, 10, WOOD_MID)
	_px(x + 2, y + 2, 10, 8, LAVENDER)
	_px(x + 8, y + 3, 2, 2, BUTTER)
	_px(x + 2, y + 7, 10, 3, LEAF)
	_px(x + 4, y + 6, 3, 1, LEAF)
	_px(x + 9, y + 6, 2, 1, LEAF)
	_px(x + 5, y + 5, 1, 1, MINT)


func _draw_clock(x: int, y: int) -> void:
	_px(x + 1, y, 8, 14, WOOD_DARK)
	_px(x + 2, y + 1, 6, 12, WOOD_MID)
	_px(x + 3, y + 2, 4, 4, CREAM)
	_px(x + 5, y + 3, 1, 2, INK)
	_px(x + 5, y + 4, 2, 1, INK)
	_px(x + 5, y + 7, 1, 3, BRASS)
	_px(x + 4, y + 10, 3, 2, BRASS)
