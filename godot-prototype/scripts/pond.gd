extends Node2D
## The pond shown while fishing (a port of src/render/pond.ts): 96 pixels
## wide, as tall as its space. Water with a moving surface, light rays,
## see-through fish swimming about, bubbles, and the bait on its line. The
## bait splashes going in and out, dips at a nibble and tugs at a bite. The
## fish going for the bait is small for a shrimp, middling for a salmon and
## big for a lobster. While you reel in the surface churns with foam.

const W := 96
const SURFACE := 3
const INK := Color("#2b2140")
const PINK := Color("#f48fb1")
const SKY := Color("#9ad3f0")
const OCEAN := Color("#5a8fd6")
const WHITE := Color("#ffffff")
const LAVENDER := Color("#d9c8ee")

const FISH := [
	["k.kkkk.", ".kkkkkk", "k.kkkk."],
	["k...kkkk..", "kk.kkkkkkk", "kkkkkkkkk.", "k...kkk..."],
	[".......kk....", "k...kkkkkkk..", "kk.kkkkkkkkkk", "k...kkkkkkkk.", ".....kk......"],
]
const BUBBLES := [["w"], [".w.", "w.w", ".w."], [".ww.", "w..w", "w..w", ".ww."]]
const FOAM := [["w.w", ".w."], [".ww.", "wwww", ".w.."], ["w..w.", ".www.", "ww.ww"], [".w", "ww"]]
const CROWN := [["w...w", ".w.w."], ["w.....w", ".w.w.w.", "..w.w.."]]
const BAIT := ["..k..", ".ppk.", "pp.k.", ".ppp.", "..pp.", "k.pk.", ".kk.."]
const RIPPLE_SECONDS := 0.7

## ready, waiting, nibble, bite or reeling (set by the screen).
var phase := "ready"
var height := 36
## The pixel column the line comes down, under the rod tip in the room.
var line_x := 60

var _fish: Array = []
var _bubbles: Array = []
var _foam: Array = []
var _ripples: Array = []
var _crown := {"x": 0.0, "life": 0.0}
var _bait := Vector2(58, -10)
var _biter = null
var _wanted: Array = FISH[0]
var _let_go := false
var _tug := 0
var _bubble_in := 0.0
var _foam_in := 0.0
var _t := 0.0


func resize(h: int) -> void:
	height = maxi(24, h)
	_fish = [_new_fish(FISH.pick_random()), _new_fish(FISH.pick_random()), _new_fish(FISH[0]), _new_fish(FISH[1])]
	_bubbles.clear()
	_foam.clear()
	_bait = Vector2(line_x - 2, SURFACE - 6)
	_biter = null


func _new_fish(sprite: Array) -> Dictionary:
	return {"sprite": sprite, "x": randf_range(0, W - sprite[0].length()),
		"y": randf_range(SURFACE + 5, height - sprite.size() - 2),
		"vx": randf_range(4, 9) * (-1 if randf() < 0.5 else 1), "turn_in": randf_range(2, 5), "leaving": false}


## Which fish will go for the bait this cast (0 small, 1 medium, 2 big).
func hook(shadow: int) -> void:
	_wanted = FISH[shadow]
	_biter = null


## The catch is over: a landed fish leaves with a splash, a lost one darts off.
func landed(caught: bool) -> void:
	_let_go = true
	var f = _biter
	_biter = null
	if f == null:
		return
	if caught:
		_splash(_bait.x + 2)
		_fish.erase(f)
		var next := _new_fish(f.sprite)
		next.x = -next.sprite[0].length() - 20 if randf() < 0.5 else W + 20
		next.vx = absf(next.vx) if next.x < 0 else -absf(next.vx)
		_fish.append(next)
	else:
		f.vx = -40.0 if f.x + f.sprite[0].length() / 2.0 < _bait.x else 40.0
		f.turn_in = 3.0


## Where the bait is, in pond pixels.
func bait_at() -> Vector2:
	return _bait + Vector2(2, 3)


func _spawn_bubble(x: float, y: float) -> void:
	_bubbles.append({"sprite": BUBBLES.pick_random(), "x": x, "y": y, "vy": randf_range(6, 14), "phase": randf_range(0, 6)})


func _spawn_foam(x: float) -> void:
	var s: Array = FOAM.pick_random()
	_foam.append({"sprite": s, "x": x - s[0].length() / 2.0, "y": SURFACE - 1 + randf_range(-1, 2), "life": randf_range(0.3, 0.8)})


func _splash(x: float) -> void:
	_crown = {"x": x, "life": 0.22}
	_ripples.append({"x": x, "age": 0.0})
	for i in 4:
		_spawn_foam(x + randf_range(-6, 6))
	for i in 3:
		_spawn_bubble(x + randf_range(-3, 4), SURFACE + randf_range(3, 7))


func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)
	_t += dt
	_update(dt)
	queue_redraw()


func _update(dt: float) -> void:
	if phase != "reeling":
		_let_go = false
	var reeling := phase == "reeling" and not _let_go
	var biting := phase == "bite"
	var line := phase in ["waiting", "nibble", "bite"] or reeling
	var target_y := -10.0 if phase == "ready" else roundf(height * 0.45)
	var was_y := _bait.y
	_bait.y += signf(target_y - _bait.y) * minf(absf(target_y - _bait.y), 14 * dt)
	if (was_y < SURFACE) != (_bait.y < SURFACE):
		_splash(_bait.x + 2)
	var ms := _t * 1000.0
	var jerk := roundi(sin(ms / 60.0)) if biting or reeling else 0
	_tug = [3, 3, 1, 0][int(ms / 110.0) % 4] if biting else (1 if phase == "nibble" else 0)
	if line and _biter == null:
		_biter = _biter_of(_wanted)
	elif not line:
		_biter = null
	for f in _fish.duplicate():
		var fw: int = f.sprite[0].length()
		if f == _biter:
			var right: bool = f.x + fw / 2.0 < _bait.x
			var goal_x: float = _bait.x - fw + 2 if right else _bait.x + 3
			var goal_y: float = _bait.y + 2 - floor(f.sprite.size() / 2.0)
			var speed := 0.6 if phase in ["waiting", "nibble"] else 6.0
			f.x += (goal_x - f.x) * minf(1, speed * dt)
			f.y += (goal_y - f.y) * minf(1, speed * dt)
			f.vx = absf(f.vx) * (1 if right else -1)
			if reeling:
				f.x += randf_range(-1, 1)
				f.y += randf_range(-0.7, 0.7)
			continue
		f.x += f.vx * dt * (1.6 if reeling else 1.0)
		if absf(f.vx) > 9:
			f.vx *= 1 - minf(1, dt * 1.5)
		if f.leaving:
			if f.x < -fw or f.x > W:
				_fish.erase(f)
			continue
		f.turn_in -= dt
		if f.turn_in <= 0:
			f.turn_in = randf_range(2, 5)
			if randf() < 0.4:
				f.vx = -f.vx
			f.y = clampf(f.y + randf_range(-3, 3), SURFACE + 5, height - f.sprite.size() - 2)
		if f.x < -fw:
			f.vx = absf(f.vx)
		if f.x > W:
			f.vx = -absf(f.vx)
	_bubble_in -= dt
	if _bubble_in <= 0 and not _fish.is_empty():
		_bubble_in = randf_range(0.04, 0.12) if reeling else (randf_range(0.08, 0.2) if biting else randf_range(0.5, 1.2))
		if (biting or reeling) and _biter != null:
			_spawn_bubble(_bait.x + randf_range(-3, 6), _bait.y + randf_range(0, 3))
		else:
			var from: Dictionary = _fish.pick_random()
			_spawn_bubble(from.x + randf_range(-3, 6), from.y + randf_range(0, 3))
	for b in _bubbles.duplicate():
		b.y -= b.vy * dt
		b.phase += dt * 5
		if b.y <= SURFACE:
			_bubbles.erase(b)
			if randf() < 0.5:
				_spawn_foam(b.x)
	_foam_in -= dt
	if reeling and _foam_in <= 0:
		_foam_in = randf_range(0.03, 0.09)
		_spawn_foam(_bait.x + randf_range(-12, 12) + jerk)
	for f in _foam.duplicate():
		f.life -= dt
		if f.life <= 0:
			_foam.erase(f)
	for r in _ripples.duplicate():
		r.age += dt
		if r.age >= RIPPLE_SECONDS:
			_ripples.erase(r)
	_crown.life -= dt
	_bait.x = line_x - 2 + jerk


func _biter_of(sprite: Array):
	for f in _fish:
		if f.sprite == sprite and not f.leaving:
			return f
	var stay := _fish.filter(func(f: Dictionary) -> bool: return not f.leaving)
	if stay.size() >= 4:
		var out: Dictionary = stay.pick_random()
		out.leaving = true
		out.vx = -12.0 if out.x + out.sprite[0].length() / 2.0 < W / 2.0 else 12.0
	var f := _new_fish(sprite)
	f.x = -sprite[0].length() - 6 if randf() < 0.5 else W + 6
	_fish.append(f)
	return f


func _sprite(s: Array, x: float, y: float, colors: Dictionary, flip := false) -> void:
	var w: int = s[0].length()
	for sy in s.size():
		var row: String = s[sy]
		for sx in w:
			var c = colors.get(row[sx])
			if c != null:
				draw_rect(Rect2(roundi(x) + (w - 1 - sx if flip else sx), roundi(y) + sy, 1, 1), c)


func _draw() -> void:
	var ms := _t * 1000.0
	var shallow := roundi(height * 0.4)
	draw_rect(Rect2(0, 0, W, height), SKY)
	draw_rect(Rect2(0, shallow + 3, W, height - shallow - 3), OCEAN)
	# A dithered edge between the shallow and the deep water.
	for k in 3:
		for x in W:
			var n := x + k
			if (k == 0 and n % 4 == 0) or (k == 1 and n % 2 == 0) or (k == 2 and n % 4 != 0):
				draw_rect(Rect2(x, shallow + k, 1, 1), OCEAN)
	# Light rays drifting slowly.
	for i in 3:
		var x0 := fmod(i * 37 + ms / 250.0, W + 20) - 10
		for y in range(SURFACE, shallow):
			draw_rect(Rect2(roundi(x0 + (y - SURFACE) / 2.0), y, 3, 1), Color(WHITE, 0.18))
	# The surface: calm, or churning around the bait while reeling in.
	var reeling := phase == "reeling"
	for x in W:
		var near := maxf(0, 1 - absf(x - _bait.x) / 24.0) if reeling else 0.0
		var amp := 0.6 + near * 2
		var y := SURFACE + roundi(sin(x / 4.0 + ms / 400.0) * amp + (sin(x / 2.0 - ms / 90.0) * near if reeling else 0.0))
		draw_rect(Rect2(x, y - 1, 1, 1), WHITE)
		draw_rect(Rect2(x, y, 1, 1), LAVENDER)
	for f in _fish:
		_sprite(f.sprite, f.x, f.y, {"k": Color(INK, 0.35)}, f.vx < 0)
	if _bait.y > -7:
		var by := _bait.y + _tug
		draw_rect(Rect2(_bait.x + 2, 0, 1, maxf(0, roundf(by))), INK)
		_sprite(BAIT, _bait.x, by, {"k": INK, "p": PINK})
	for r in _ripples:
		var reach := 2 + int(r.age / RIPPLE_SECONDS * 5) * 2
		for side in [-1, 1]:
			draw_rect(Rect2(roundi(r.x + side * reach), SURFACE, 2, 1), WHITE)
			if reach > 4:
				draw_rect(Rect2(roundi(r.x + side * (reach - 4)), SURFACE + 1, 1, 1), WHITE)
	if _crown.life > 0:
		var c: Array = CROWN[0 if _crown.life > 0.11 else 1]
		_sprite(c, _crown.x - floor(c[0].length() / 2.0), SURFACE - 2, {"w": WHITE})
	for b in _bubbles:
		_sprite(b.sprite, b.x + roundi(sin(b.phase)), b.y, {"w": Color(WHITE, 0.85)})
	for f in _foam:
		_sprite(f.sprite, f.x, f.y, {"w": WHITE})
	# Sparkles around the bait while a fish bites.
	if phase == "bite" and int(ms / 180) % 2 == 0:
		var y := _bait.y + _tug
		draw_rect(Rect2(_bait.x - 3, y + 2, 1, 1), WHITE)
		draw_rect(Rect2(_bait.x + 5, y + 1, 1, 1), WHITE)
		draw_rect(Rect2(_bait.x + 1, y - 3, 1, 1), WHITE)
