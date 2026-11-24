class_name FishingTuning
extends Resource
## The fishing mini-game's numbers (CONFIG.fishing in the web game), in
## data/fishing.tres. Speeds are in bar widths per second.

@export var fish: Array[FishKind] = []
@export var energy_per_cast := 3
@export var bite_after_min := 4.0
@export var bite_after_max := 10.0
## How long you have to tap Reel in after a bite.
@export var bite_window := 1.6
## Fake nibbles before the real bite: up to this many, this long each.
@export var nibbles_max := 2
@export var nibble_seconds := 0.4
@export_group("Zones")
@export var zone_perfect := 0.16
@export var zone_good := 0.08
@export var zone_weak := 0.07
@export_group("Reel")
@export var pull := 1.5
@export var drift := 1.0
@export var max_speed := 0.5
@export var shift_every_min := 2.5
@export var shift_every_max := 3.5
@export var shift_by_min := 0.1
@export var shift_by_max := 0.22
@export var glide_seconds := 0.6
## At the start the meter doesn't drain while the dot gets to the green.
@export var grace_seconds := 2.0
@export var meter_start := 0.3
@export var fill_perfect := 0.2
@export var fill_good := 0.12
@export var fill_weak := 0.06
@export var drain := 0.15
## Landed with at least this share on green: perfect.
@export var grade_share := 0.5
@export var tug_every_min := 1.0
@export var tug_every_max := 1.8
@export_group("Streak")
## Each perfect in a row makes the rare fish this many percent likelier.
@export var streak_bonus := 4
@export var streak_max := 3
