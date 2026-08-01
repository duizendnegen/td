# isometric-camera

## Purpose

A single fixed isometric view over the scene: an orthographic projection that keeps maze layout
measurable while its low pitch lets height read — POC goal #3 (isometric camera view).

## ADDED Requirements

### Requirement: Isometric projection

The camera SHALL use an orthographic projection at a fixed 45° yaw and a pitch of ~30–35° (true
isometric is arctan(1/√2) ≈ 35.26°), framing the entire board. A 1-tile gap SHALL measure
identically anywhere on screen (no perspective distortion), keeping maze layout legible.

#### Scenario: Whole board visible and measurable

- **WHEN** the game is running
- **THEN** all 30×20 tiles are on screen and equal-sized gaps appear equal-sized regardless of
  board position

### Requirement: Height legibility

The pitch SHALL be low enough that objects of different heights are visibly distinguishable by
silhouette. Occlusion of tiles directly behind tall objects is accepted, not avoided.

#### Scenario: Height reads

- **WHEN** two objects of different heights stand on the board
- **THEN** the taller object is visibly taller on screen

### Requirement: Resize-stable framing

On viewport resize the frustum SHALL re-fit so the entire board plus margin stays visible at any
aspect ratio, without distortion.

#### Scenario: Window resized

- **WHEN** the viewport aspect ratio changes
- **THEN** the entire board remains on screen and tiles keep their proportions
