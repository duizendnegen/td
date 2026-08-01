# dual-cameras

## Purpose

Two informational views over one scene: an orthographic architect view that shows layout truth for
maze planning, and a perspective commander view that shows height and power — the first read on POC
goal #3 (asymmetric camera views).

## ADDED Requirements

### Requirement: Architect view

The architect view SHALL use an orthographic projection at a fixed yaw, pitched ~55–60°, framing
the entire board. A 1-tile gap SHALL measure identically anywhere on screen (no perspective
distortion), keeping maze layout legible.

#### Scenario: Whole board visible and measurable

- **WHEN** the architect view is active
- **THEN** all 30×20 tiles are on screen and equal-sized gaps appear equal-sized regardless of
  board position

### Requirement: Commander view

The commander view SHALL use a perspective projection (FOV ~45°, pitch ~25–35°) framed on the
treasury at mid distance, with orbitable yaw. It SHALL convey vertical scale — occlusion of distant
objects by near ones is accepted, not avoided.

#### Scenario: Height reads in commander view

- **WHEN** the commander view is active
- **THEN** objects of different heights are visibly distinguishable in a way the architect view
  does not convey

### Requirement: Eased hotkey toggle

A single hotkey (Tab) SHALL swap between the two views with a smooth eased transition of roughly
400 ms on camera position and target. Repeated toggling SHALL never leave the camera in a broken
intermediate state.

#### Scenario: Toggle mid-transition

- **WHEN** Tab is pressed again before a transition completes
- **THEN** the camera transitions cleanly toward the other view from wherever it currently is
