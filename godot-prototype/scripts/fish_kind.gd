class_name FishKind
extends Resource
## One kind of fish in the pond (CONFIG.fishing.fish in the web game). Each
## is a .tres file in data/fish/: duplicate one to add a fish.

enum Shadow { SMALL, MEDIUM, BIG }

@export var id := ""
@export var display_name := ""
## The food you get when you land it.
@export var food: CareOption
## How likely it is to bite, in percent (all fish together make 100).
@export_range(0, 100) var odds := 50
## How big its shadow looks swimming up to the bait.
@export var shadow := Shadow.SMALL
## The rare one, which a streak of perfect catches makes likelier.
@export var rare := false
## The line shown when the catch bar comes up.
@export_multiline var hold_line := ""
@export_group("How it fights")
## Below 1 the zones slide more often.
@export var shift_every := 1.0
## Above 1 the zones slide further.
@export var shift_by := 1.0
## Above 1 the zones glide more slowly.
@export var glide := 1.0
## Above 1 the meter empties faster.
@export var drain := 1.0
## How hard it yanks the dot back left now and then (0 = never).
@export var tug := 0.0
