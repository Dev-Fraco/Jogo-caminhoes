extends Control
## Controles de toque para celular.
## Esquerda da tela: joystick para andar. Direita: arrastar para girar a câmera.
## Botão "PULAR" no canto inferior direito.
## Não usa nós de UI de verdade: desenha tudo e lê os toques direto em _input.

const JOY_RADIUS := 110.0
const JUMP_RADIUS := 70.0
const JUMP_MARGIN := 40.0

## Vetor de movimento, de -1 a 1 em cada eixo (lido pelo jogador).
var move_vector := Vector2.ZERO
## Quanto o dedo arrastou na direita desde a última leitura (consumido pelo jogador).
var look_delta := Vector2.ZERO
## Verdadeiro uma vez quando o botão de pular é tocado (consumido pelo jogador).
var jump_requested := false

var _joy_index := -1
var _joy_origin := Vector2.ZERO
var _joy_pos := Vector2.ZERO
var _look_index := -1
var _look_last := Vector2.ZERO
var _jump_index := -1


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _input(event: InputEvent) -> void:
	var touch := event as InputEventScreenTouch
	var drag := event as InputEventScreenDrag

	if touch:
		if touch.pressed:
			_on_touch_down(touch.index, touch.position)
		else:
			_on_touch_up(touch.index)
		queue_redraw()
	elif drag:
		_on_touch_drag(drag.index, drag.position)
		queue_redraw()


func _on_touch_down(index: int, pos: Vector2) -> void:
	if _in_jump_button(pos):
		_jump_index = index
		jump_requested = true
	elif pos.x < size.x * 0.5 and _joy_index == -1:
		_joy_index = index
		_joy_origin = pos
		_joy_pos = pos
	elif _look_index == -1:
		_look_index = index
		_look_last = pos


func _on_touch_up(index: int) -> void:
	if index == _joy_index:
		_joy_index = -1
		move_vector = Vector2.ZERO
	if index == _look_index:
		_look_index = -1
	if index == _jump_index:
		_jump_index = -1


func _on_touch_drag(index: int, pos: Vector2) -> void:
	if index == _joy_index:
		_joy_pos = pos
		var offset := (_joy_pos - _joy_origin) / JOY_RADIUS
		move_vector = offset.limit_length(1.0)
	elif index == _look_index:
		look_delta += pos - _look_last
		_look_last = pos


func _in_jump_button(pos: Vector2) -> bool:
	return pos.distance_to(_jump_center()) <= JUMP_RADIUS * 1.3


func _jump_center() -> Vector2:
	return Vector2(size.x - JUMP_MARGIN - JUMP_RADIUS, size.y - JUMP_MARGIN - JUMP_RADIUS)


func _draw() -> void:
	# Joystick: aparece só enquanto o dedo está nele.
	if _joy_index != -1:
		draw_circle(_joy_origin, JOY_RADIUS, Color(1, 1, 1, 0.12))
		draw_arc(_joy_origin, JOY_RADIUS, 0.0, TAU, 48, Color(1, 1, 1, 0.35), 3.0)
		var knob := _joy_origin + move_vector * JOY_RADIUS
		draw_circle(knob, 44.0, Color(1, 1, 1, 0.45))

	# Botão de pular, sempre visível.
	var jump_color := Color(1, 1, 1, 0.5) if _jump_index != -1 else Color(1, 1, 1, 0.25)
	draw_circle(_jump_center(), JUMP_RADIUS, jump_color)
	draw_arc(_jump_center(), JUMP_RADIUS, 0.0, TAU, 48, Color(1, 1, 1, 0.6), 3.0)
	draw_string(ThemeDB.fallback_font, _jump_center() + Vector2(-42, 8), "PULAR",
		HORIZONTAL_ALIGNMENT_CENTER, 84, 22, Color(1, 1, 1, 0.9))
