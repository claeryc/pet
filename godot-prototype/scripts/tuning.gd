class_name Tuning
extends Resource
## The game's tuning numbers (a small part of src/game/config.ts in the web
## game). They live in data/tuning.tres: open it in the editor and change
## them in the Inspector. Stats go from 0 (empty) to 100 (full).

@export_group("Starting stats")
@export var start_hunger := 80.0
@export var start_happiness := 80.0
@export var start_health := 100.0
@export var start_energy := 80.0

@export_group("Points lost per hour")
@export var decay_hunger := 4.0
@export var decay_happiness := 3.0
@export var decay_health := 0.5
@export var decay_energy := 3.0
## Adults get hungry and bored a little slower.
@export var adult_decay_multiplier := 0.9

@export_group("Mood")
## Below this a stat counts as low: the pet looks sad.
@export var low_stat := 30.0
## At or above this, a stat counts as well looked after.
@export var good_stat := 50.0
## With this much joy the pet plays its calm "cheerful" animation.
@export var cheerful_happiness := 70.0
@export var crying_below := 15.0
@export var sleepy_below := 20.0
## Nobody did anything with the pet for this long: it pouts.
@export var pout_after_seconds := 240.0

@export_group("Sleep")
@export var bedtime_hour := 21
@export var wake_hour := 8
@export var energy_per_hour_asleep := 12.0
@export var decay_multiplier_asleep := 0.5
## Staying up late with the lights on is tiring.
@export var energy_multiplier_night_awake := 2.0

@export_group("Health")
@export var neglect_decay_per_hour := 2.0
@export var recover_per_hour_when_cared := 1.5
## Health below this makes the pet look sick.
@export var sick_below := 30.0

@export_group("Feel")
## How long the happy reaction plays after playing, in seconds.
@export var reaction_seconds := 1.4
## Eating: the food goes in `bites` bites over this many seconds.
@export var eating_seconds := 2.8
@export var bites := 4
## An idle move (look around, stretch) about this often, in seconds.
@export var idle_move_every := 9.0
## Taps closer together than this count as one cuddle.
@export var tap_cooldown := 1.4
## Starting gold.
@export var start_gold := 120
