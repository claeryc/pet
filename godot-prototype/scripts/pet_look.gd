class_name PetLook
extends Resource
## Everything needed to draw one pet: its animations, its face layer and how
## far its head moves in each frame (so the face follows the head).
## tools/import_art.py makes these from the web game's manifest.json, and
## they open in the Inspector like any other resource.

@export var display_name := ""
## One animation per row of the sprite sheet (idle, sad, sleep, ...).
@export var frames: SpriteFrames
## The face set (one animation per expression), or null when the face is
## drawn on the body.
@export var face_frames: SpriteFrames
## The pixel on the body where the face set's anchor (16, 18) goes.
@export var face_point := Vector2i(16, 18)
## Per animation, per frame: how many pixels the head is below (+) or
## above (-) where it is in the first idle frame.
@export var head_offsets: Dictionary = {}
## The same, sideways: pixels right (+) or left (-).
@export var head_shifts: Dictionary = {}
## Extra idle moves (a look around, a stretch) played now and then.
@export var idle_moves: PackedStringArray = []


func head_at(animation: StringName, frame: int) -> Vector2i:
	var dy: Array = head_offsets.get(String(animation), [])
	var dx: Array = head_shifts.get(String(animation), [])
	return Vector2i(dx[frame] if frame < dx.size() else 0, dy[frame] if frame < dy.size() else 0)
