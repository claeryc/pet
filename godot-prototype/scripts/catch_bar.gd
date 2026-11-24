extends Control
## The catch bar along the bottom of the pond while reeling in: a plum frame
## with stepped corners, the coloured zones, the dot, and the catch meter
## underneath that takes the colour of the zone the dot is on.

const PLUM := Color("#5b3f6e")
const INK := Color("#2b2140")
const WHITE := Color("#ffffff")
const ZONE_COLORS := {
	"miss": Color("#9ad3f0"),
	"weak": Color("#e05a7a"),
	"good": Color("#ffe596"),
	"perfect": Color("#6cc19a"),
}
const PX := 3.0
const TRACK := 22.0
const METER := 6.0

var zones := {"perfect": Vector2(0.45, 0.55), "good": Vector2(0.4, 0.6), "weak": Vector2(0.35, 0.65)}
var marker := 0.0
var meter := 0.3
var _blink_until := 0


func _ready() -> void:
	custom_minimum_size.y = PX * 3 + TRACK + METER


func show_reel(t: FishingTuning, reel: Dictionary) -> void:
	zones = FishingRules.zones_around(t, reel.center, reel.widen)
	marker = reel.marker
	meter = reel.meter
	queue_redraw()


## A catch landed: the dot blinks where it ended up.
func blink() -> void:
	_blink_until = Time.get_ticks_msec() + 600


func _process(_delta: float) -> void:
	if Time.get_ticks_msec() < _blink_until + 50:
		queue_redraw()


func _draw() -> void:
	var w := size.x
	var h := PX * 3 + TRACK + METER
	# The frame, with its corners cut in one pixel step.
	draw_rect(Rect2(PX, 0, w - PX * 2, h), PLUM)
	draw_rect(Rect2(0, PX, w, h - PX * 2), PLUM)
	var tx := PX
	var tw := w - PX * 2
	var ty := PX
	# The zones, with hard colour edges.
	draw_rect(Rect2(tx, ty, tw, TRACK), ZONE_COLORS.miss)
	for k in ["weak", "good", "perfect"]:
		var z: Vector2 = zones[k]
		draw_rect(Rect2(tx + roundf(z.x * tw), ty, roundf((z.y - z.x) * tw), TRACK), ZONE_COLORS[k])
	# The dot: white with an ink outline, a little taller than the track.
	var mx := tx + roundf(marker * tw)
	var on := Time.get_ticks_msec() < _blink_until and (Time.get_ticks_msec() / 75) % 2 == 1
	draw_rect(Rect2(mx - 5, ty - 4, 10, TRACK + 8), INK)
	draw_rect(Rect2(mx - 3, ty - 2, 6, TRACK + 4), INK if on else WHITE)
	# The meter.
	var my := ty + TRACK + PX
	draw_rect(Rect2(tx, my, tw, METER), INK)
	var grade := FishingRules.grade_at(zones, marker)
	draw_rect(Rect2(tx, my, roundf(meter * tw), METER), ZONE_COLORS[grade])
