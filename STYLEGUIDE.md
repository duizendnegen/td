---
name: Aether-Industrial Strategy
colors:
  surface: '#091421'
  surface-dim: '#091421'
  surface-bright: '#303a48'
  surface-container-lowest: '#050f1c'
  surface-container-low: '#121c2a'
  surface-container: '#16202e'
  surface-container-high: '#212b39'
  surface-container-highest: '#2b3544'
  on-surface: '#d9e3f6'
  on-surface-variant: '#d0c6ab'
  inverse-surface: '#d9e3f6'
  inverse-on-surface: '#27313f'
  outline: '#999077'
  outline-variant: '#4d4732'
  surface-tint: '#e9c400'
  primary: '#fff6df'
  on-primary: '#3a3000'
  primary-container: '#ffd700'
  on-primary-container: '#705e00'
  inverse-primary: '#705d00'
  secondary: '#ffb779'
  on-secondary: '#4c2700'
  secondary-container: '#955200'
  on-secondary-container: '#ffd9bc'
  tertiary: '#d8ffe7'
  on-tertiary: '#003824'
  tertiary-container: '#65f2b5'
  on-tertiary-container: '#006d4a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe16d'
  primary-fixed-dim: '#e9c400'
  on-primary-fixed: '#221b00'
  on-primary-fixed-variant: '#544600'
  secondary-fixed: '#ffdcc1'
  secondary-fixed-dim: '#ffb779'
  on-secondary-fixed: '#2e1500'
  on-secondary-fixed-variant: '#6c3a00'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#091421'
  on-background: '#d9e3f6'
  surface-variant: '#2b3544'
typography:
  headline-xl:
    fontFamily: Public Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: 0.1em
  headline-lg:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: 0.05em
  headline-sm:
    fontFamily: Public Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: 0.05em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  number-treasury:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.15em
spacing:
  unit: 4px
  gutter: 16px
  margin-safe: 32px
  panel-padding: 24px
---

## Brand & Style
This design system utilizes a **Tactile / Steampunk-Lite** aesthetic, blending industrial weight with fantasy refinement. The design narrative centers on the "Treasury"—the lifeblood of the player's defense. The UI should feel like an integrated part of the machine, utilizing heavy materials like forged iron, polished brass, and slate. 

The atmosphere is "High Stakes" and mechanical. Visual elements should appear heavy and physically grounded, using beveled edges and metallic textures to evoke the feeling of a high-pressure control room. Every interaction should feel like throwing a physical lever or pressing a heavy iron plate.

## Colors
The palette is rooted in a deep "Charcoal Slate" base to provide a high-contrast canvas for the metallic elements.
- **Primary (Gold):** Reserved for the Treasury, currency readouts, and upgraded states. It is the "Heartbeat" color.
- **Secondary (Bronze):** Used for structural UI elements, inactive tower slots, and secondary navigation.
- **Tertiary (Emerald):** Strictly used for "Wave Start," "Success," and "Ready" states.
- **Danger (Crimson):** Indicates debt, critical tower damage, or insufficient funds.
- **Backgrounds:** Utilize a mix of #1F2937 (Slate) and #111827 (Deep Iron) to create depth.

## Typography
Typography reflects the industrial nature of the game. 
- **Headlines:** Use **Public Sans** in all-caps with high tracking (letter-spacing) to mimic stamped metal lettering.
- **Body:** **Inter** provides high legibility for tower descriptions and tutorial text.
- **Data/Numbers:** All currency and treasury readouts must use **JetBrains Mono**. This ensures tabular figures remain stable as values rapidly fluctuate, preventing layout "jitter" during gameplay.

## Layout & Spacing
The design system follows a **Fixed Grid** approach for HUD elements to maintain the feeling of a heavy control console. The shipped layout anchors follow the mockups (`mockups/desktop.html`, `mockups/mobile.html`), which are the layout reference for this system.
- **HUD Layout (desktop):** A full-width top app bar carries the concede control, the wave counter with its progress bar, and the Treasury readout (anchored right, in a recessed slot). The build palette is a left rail; the tower inspector is a right panel; START WAVE sits bottom-right.
- **HUD Layout (mobile / short landscape):** A compact top bar, the build palette as a bottom menu, and the inspector as a bottom sheet that swaps with the menu while a tower is selected.
- **Margins:** A 32px safe-zone margin is required on all sides to prevent UI from feeling cramped against the screen edges.
- **Rhythm:** Spacing should be tight and efficient (4px/8px/16px increments), suggesting precise engineering.

## Elevation & Depth
Depth is achieved through **Tonal Layers** and **Beveled Borders** rather than shadows.
- **Surfaces:** Use linear gradients (top-to-bottom) on panels to mimic a brushed metal surface.
- **Beveling:** Every panel must have a 2px inset highlight on the top/left and a 2px offset shadow on the bottom/right to create a "stamped" or "riveted" appearance.
- **Active State:** Elements that are "pressed" should invert their bevel (inset shadows) and shift down by 2px to provide mechanical feedback.

## Shapes
The design system uses **lightly rounded corners**, as established by the mockups: a 2px default radius on small elements, stepping up to 4px/8px/12px on larger panels, sheets, and hero buttons. The rounding stays subtle enough that elements still read as cut and stamped metal plates; softness comes from the small radii plus the beveled inset highlights, not from pill shapes.

## Components
- **Mechanical Buttons:**
  - *Affordable:* Gold (#FFD700) border, Slate background. Deep tactile movement on hover.
  - *Debt-Warning:* Pulsing Crimson (#DC2626) border. Background shifts to dark red.
  - *Blocked:* Low-opacity Slate with a diagonal "caution" stripe pattern across the surface.
- **Treasury Panel:** A heavy iron plate (Deep Slate) with a recessed slot for the JetBrains Mono readout. This is the only element that can use a subtle glow (Primary Gold) to signify importance.
- **Tower Cards:** Rectangular cards with beveled corners. Use secondary Bronze for the frame and include a small "rivet" icon in each corner.
- **Status Icons:** 1px weight glyphs for enemy types, using high-contrast white against the dark backgrounds. Status effects (like 'Slow') should use the Secondary Bronze color.
- **Wave Progress Bar:** A segmented metal bar that fills with Emerald Green as the wave approaches completion.