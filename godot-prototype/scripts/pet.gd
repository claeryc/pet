extends Node2D
## One pet standing in the room: its body, its face on top (moving with the
## head), Zzz while it sleeps, hearts when it's cuddled and the food it's
## eating. The screen tells it how it feels (set_mood) and what just
## happened (react, eat); it picks the animations itself.

const FACE_ANCHOR := Vector2i(16, 18)

@export var look: PetLook:
	set(v):
		look = v
		if is_node_ready():
			_apply_look()

@onready var body: AnimatedSprite2D = $Body
@onready var face: AnimatedSprite2D = $Face
@onready var food: Sprite2D = $Food
@onready var hearts: CPUParticles2D = $Hearts
@onready var zzz: Node2D = $Zzz
@onready var idle_timer: Timer = $IdleTimer

## What fits its mood (from PetRules.look and PetRules.mood_face).
var mood_animation := &"idle"
var mood_face := &"content"
## A reaction playing over the mood (happy after a cuddle, eating), or "".
var _reaction := &""
var _reaction_face := &""
var _reaction_tween: Tween
var _eat_tween: Tween
## An idle move (look around, stretch) playing right now, or "".
var _move := &""


func _ready() -> void:
	body.frame_changed.connect(_follow_head)
	body.animation_changed.connect(_follow_head)
	body.animation_finished.connect(_on_move_finished)
	idle_timer.timeout.connect(_on_idle_timer)
	_apply_look()


func _apply_look() -> void:
	if not look:
		return
	body.sprite_frames = look.frames
	face.sprite_frames = look.face_frames
	face.visible = look.face_frames != null
	_move = &""
	_restart_idle_timer()
	_play(true)


func set_mood(animation: StringName, face_name: StringName) -> void:
	if animation == mood_animation and face_name == mood_face:
		return
	mood_animation = animation
	mood_face = face_name
	if animation == &"sleep":
		_end_reaction() # lights off: straight to sleep
	_play()


## Plays a happy hop (and hearts, for a cuddle) for `seconds`.
func react(seconds: float, with_hearts := true) -> void:
	_start_reaction(&"happy", &"happy", seconds)
	if with_hearts:
		hearts.restart()
		hearts.emitting = true


## Eats `texture` in `bites` bites over `seconds`, then looks happy.
func eat(texture: Texture2D, seconds: float, bites: int) -> void:
	_start_reaction(&"eat", &"chewing", seconds)
	food.texture = texture
	food.visible = true
	food.scale = Vector2.ONE
	if _eat_tween:
		_eat_tween.kill()
	var t := create_tween()
	_eat_tween = t
	for i in bites:
		var left := 1.0 - float(i + 1) / bites
		t.tween_interval(seconds / bites * 0.7)
		t.tween_property(food, "scale", Vector2.ONE * left, seconds / bites * 0.3)
	t.tween_callback(func() -> void:
		food.visible = false
		react(1.0, false))


func _start_reaction(animation: StringName, face_name: StringName, seconds: float) -> void:
	if _reaction_tween:
		_reaction_tween.kill()
	food.visible = false
	_reaction = animation
	_reaction_face = face_name
	_play(true)
	_reaction_tween = create_tween()
	_reaction_tween.tween_interval(seconds)
	_reaction_tween.tween_callback(func() -> void:
		_reaction = &""
		_reaction_face = &""
		_play())


func _end_reaction() -> void:
	if _reaction_tween:
		_reaction_tween.kill()
	if _eat_tween:
		_eat_tween.kill()
	food.visible = false
	_reaction = &""
	_reaction_face = &""


func _current_animation() -> StringName:
	var a := _reaction
	if a == &"":
		a = _move if _move != &"" else mood_animation
	return a if look.frames.has_animation(a) else &"idle"


func _play(restart := false) -> void:
	if not look:
		return
	var a := _current_animation()
	if restart or body.animation != a:
		body.play(a)
	if face.visible:
		var f := _reaction_face if _reaction_face != &"" else mood_face
		if not look.face_frames.has_animation(f):
			f = &"content"
		if face.animation != f:
			face.play(f)
	zzz.visible = a == &"sleep"
	_follow_head()


## The face sits on the head, so it moves when the head bobs or leans.
func _follow_head() -> void:
	if not look:
		return
	var head := look.head_at(body.animation, body.frame)
	face.position = Vector2(look.face_point - FACE_ANCHOR + head)


## Now and then an idle or cheerful pet looks around or stretches.
func _on_idle_timer() -> void:
	_restart_idle_timer()
	if look.idle_moves.is_empty() or _reaction != &"" or _move != &"":
		return
	if mood_animation != &"idle" and mood_animation != &"cheerful":
		return
	_move = look.idle_moves[randi() % look.idle_moves.size()]
	_play(true)


func _on_move_finished() -> void:
	if _move != &"":
		_move = &""
		_play()


func _restart_idle_timer() -> void:
	idle_timer.start(Game.TUNING.idle_move_every + randf() * 3.0)
