---
name: Calm Learner
colors:
  surface: '#fbf8fc'
  surface-dim: '#dcd9dd'
  surface-bright: '#fbf8fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f6'
  surface-container: '#f0edf1'
  surface-container-high: '#eae7eb'
  surface-container-highest: '#e4e1e5'
  on-surface: '#1b1b1e'
  on-surface-variant: '#5a4138'
  inverse-surface: '#303033'
  inverse-on-surface: '#f3f0f4'
  outline: '#8e7166'
  outline-variant: '#e2bfb2'
  surface-tint: '#a73a00'
  primary: '#a33900'
  on-primary: '#ffffff'
  primary-container: '#cc4900'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb599'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#005da8'
  on-tertiary: '#ffffff'
  tertiary-container: '#0076d2'
  on-tertiary-container: '#fdfcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb599'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#7f2b00'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#d4e3ff'
  tertiary-fixed-dim: '#a4c9ff'
  on-tertiary-fixed: '#001c39'
  on-tertiary-fixed-variant: '#004883'
  background: '#fbf8fc'
  on-background: '#1b1b1e'
  surface-variant: '#e4e1e5'
typography:
  headline-xl:
    fontFamily: Nunito Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
  headline-xl-mobile:
    fontFamily: Nunito Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 38px
  headline-lg:
    fontFamily: Nunito Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Nunito Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
  headline-md:
    fontFamily: Nunito Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Nunito Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Nunito Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Nunito Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Nunito Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Nunito Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  label-md:
    fontFamily: Nunito Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  label-sm:
    fontFamily: Nunito Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

A design system purpose-built for primary school students completing digital pop quizzes and lightweight assessments. The product environment requires an emotionally reassuring, distraction-free atmosphere that reduces academic anxiety and facilitates cognitive focus.

The design philosophy balances **Minimalism** with **Soft Warmth**:
- Generous breathing room with large, accessible interactive surfaces.
- A calm, uncluttered layout stripped of gamified noise, flashing badges, and high-frequency animations.
- Friendly, tactile clarity that builds confidence in younger learners while maintaining institutional rigor.

## Colors

The palette revolves around a purposeful, warm orange balanced against soft, chalk-toned neutrals:
- **Primary Accent (`#ea580c` / `#f57c00`)**: Reserved strictly for primary calls to action, active progression steps, and critical focused states. It radiates energy and encouragement without overwhelming the canvas.
- **Secondary (`#f59e0b`)**: Used sparingly for highlights, secondary progress indicators, or hints.
- **Neutral Core (`#27272a` & `#3f3f46`)**: High-contrast, warm charcoal typography that guarantees effortless legibility without the harshness of pure black (`#000000`).
- **Surfaces (`#ffffff`, `#fafafa`, `#f4f4f5`)**: Layered warm whites and delicate zinc backdrops to segment test prompts cleanly from options.

Avoid loud semantic alerts; success states utilize a balanced, warm moss green (`#16a34a`) and caution uses gentle terracotta tones.

## Typography

**Nunito Sans** serves as the universal typeface across all levels. Its open apertures, rounded terminals, and clear character distinction make it intuitive for emerging readers and elementary grade levels.

- **Question Headers & Prompts**: High-weight (`headline-lg` / `headline-md`) scales ensure students identify the task immediately.
- **Answer Selections & Body Text**: Keep at a minimum size of 16px to 18px (`body-lg`, `label-lg`) to prevent squinting, visual fatigue, or accidental misclicks on touchscreens.
- **Letter Spacing**: Use standard to slightly positive tracking for smaller label elements (`+0.01em`) to assist dyslexic readers.

## Layout & Spacing

A centralized, single-column focused layout is preferred during quiz completion to preserve student attention:
- **Maximum Reading Width**: Question sheets and test items are confined to a max width of 720px to 800px on desktop devices.
- **Touch Ergonomics**: All interactable answer zones, buttons, and navigation elements feature generous padding (`space-md` or higher) with a minimum tap target height of 48px to 56px for smaller hands on tablets or touchscreens.
- **Breakpoints**:
  - **Mobile (< 640px)**: 1-column layout; sticky bottom action area for next/submit controls; `margin-mobile` at 1rem.
  - **Tablet (640px – 1024px)**: Single column centered; 1.5rem gutters.
  - **Desktop (> 1024px)**: Focused test container flanked by a low-profile question overview index or minimal timer panel.

## Elevation & Depth

Visual hierarchy is communicated through **tonal layering** and **low-contrast micro-shadows**, strictly steering clear of deep 3D drops or noisy visual effects:
- **Base Canvas**: Soft off-white (`#fafafa`).
- **Interactive Question Cards**: Solid white (`#ffffff`) resting on canvas with a delicate, warm boundary border (`1.5px solid #e4e4e7`) and an ambient, low-opacity drop shadow (`box-shadow: 0 2px 8px rgba(39, 39, 42, 0.04)`).
- **Selected States**: Subtle warm orange wash (`#fff7ed`) accompanied by an unambiguous primary border (`2px solid #ea580c`).
- **Disabled Elements**: Flattened neutral tones with no shadow, indicating non-interactivity cleanly.

## Shapes

The system implements a friendly, consistent **Rounded (Level 2)** shape standard:
- Cards, question tiles, and modals use `rounded-lg` (1rem / 16px) to soften the interface and make the workspace inviting.
- Input fields, choice selection pills, and buttons feature `rounded` (0.5rem / 8px) or fully rounded pill styles for status badges.
- Strict avoidance of sharp 90-degree corners to remove an overly bureaucratic, stressful aesthetic.

## Components

### Buttons
- **Primary ("Tovább", "Beküldés")**: Warm orange fill (`#ea580c`), crisp white text, bold weight (`label-md`), minimum height of 48px, gentle scale/lift micro-interaction on hover/tap.
- **Secondary ("Előző kérdés", "Vissza")**: Light neutral surface (`#f4f4f5`) with dark zinc text (`#27272a`); avoids competing with primary forward momentum.
- **Text Action**: Unstyled background with a clean underline for auxiliary links ("Segítség kérése").

### Quiz Option Tiles (Single & Multiple Choice)
- Formatted as large, stackable card components.
- Distinct letter indicator (A, B, C, D) housed in a soft circle chip on the left.
- Unselected state: White background, 1.5px border (`#e4e4e7`), neutral text.
- Selected state: Soft amber background (`#fff7ed`), bold primary border (`#ea580c`), checkmark badge confirmation.

### Progress & Timer Bar
- Clean, non-intrusive progress strip positioned at the top of the test screen.
- Warm orange fill (`#ea580c`) on a subdued zinc base (`#e4e4e7`), smooth transition transitions between questions.
- Numerical step tracker (e.g., "3 / 10 kérdés") set in `label-sm` with charcoal coloration.

### Input Fields (Fill-in-the-blank)
- Generous vertical padding (`space-sm` to `space-md`), font size 18px (`body-lg`) to prevent auto-zoom on mobile safari.
- Subdued neutral border that transitions to a clear orange focus ring (`outline: 3px solid rgba(234, 88, 12, 0.25)`).

### Question Cards & Prompts
- Enclosed within an elevated white container with a 16px corner radius.
- Clear separation between the test question stem and supplementary media/illustrations.