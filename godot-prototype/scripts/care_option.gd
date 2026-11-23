class_name CareOption
extends Resource
## One thing you can do for the pet: a food in the Feed drawer or a way to
## play in the Play drawer. Each is a .tres file in data/care/, so a new
## food is a new file made in the editor (right click > New Resource).

enum Kind { FOOD, PLAY }

@export var id := ""
@export var display_name := ""
@export var kind := Kind.FOOD
@export var icon: Texture2D
@export_group("Changes to stats")
@export_range(-100, 100) var hunger := 0
@export_range(-100, 100) var happiness := 0
@export_range(-100, 100) var health := 0
@export_range(-100, 100) var energy := 0
@export_group("")
## How many you start with (foods only).
@export var starting_count := 0
## Rice balls: the rice jar fills back up to `starting_count` every day.
@export var refills_daily := false
@export var sound: AudioStream


func effects() -> Dictionary:
	var out := {}
	for stat in ["hunger", "happiness", "health", "energy"]:
		if get(stat) != 0:
			out[stat] = get(stat)
	return out
