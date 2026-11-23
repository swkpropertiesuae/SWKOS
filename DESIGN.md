---
name: SWK OS
description: SWK OS in the exact swkpropertiesuae.com design system (deep petrol ink, SWK crest gold, Switzer, ivory canvas; all text pairs WCAG AA). Tokens live in src/web/website-theme.css and mirror the website repo src/app/globals.css.
colors:
  petrol: "#0f2a33"
  petrol-card: "#163a45"
  white: "#ffffff"
  ivory: "#fbf9f4"
  ivory-mid: "#f3eee3"
  sand-tint: "#f4f0e8"
  ink: "#0f2a33"
  body: "#3d4a51"
  muted: "#5b676e"
  line: "#e6e0d4"
  line-strong: "#cfc6b4"
  gold: "#d4a752"
  gold-text: "#8a621c"
  gold-deep: "#7a5518"
  burgundy: "#a3263a"
  signal: "#a3263a"
typography:
  display:
    fontFamily: "Switzer, Inter, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.2vw, 44px)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-.035em"
  headline:
    fontFamily: "Switzer, Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-.035em"
  body:
    fontFamily: "Switzer, Inter, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.55
    letterSpacing: "-.015em"
  eyebrow:
    fontFamily: "Switzer, Inter, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: ".22em"
  button:
    fontFamily: "Switzer, Inter, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    letterSpacing: ".14em"
rounded:
  surface: "16px"
  field: "12px"
  pill: "999px"
  circle: "50%"
spacing:
  micro: "8px"
  compact: "12px"
  control-gap: "16px"
  workspace-gap: "18px"
  overview-gap: "20px"
  surface-padding: "24px"
  spacious: "32px"
components:
  button-primary:
    backgroundColor: "{colors.emerald}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    padding: "9px 17px"
    height: "40px"
  button-dark:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    padding: "9px 17px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "9px 17px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    padding: "9px 17px"
    height: "40px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 10px"
    height: "42px"
  navigation-pill:
    backgroundColor: "{colors.card}"
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    padding: "11px 16px"
    typography: "{typography.navigation}"
  navigation-pill-active:
    backgroundColor: "{colors.emerald}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
  workspace-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "24px"
  feature-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "22px"
  cash-card:
    backgroundColor: "{colors.fold}"
    textColor: "{colors.card}"
    rounded: "{rounded.surface}"
    padding: "24px"
  status-chip:
    rounded: "{rounded.pill}"
    padding: "3px 9px"
---
# Design System: SWK OS

## Overview

**Creative North Star: "The Calm Operating Wallet"**

SWK OS translates the supplied wallet reference into a calm operating workspace for the owner and operations team. Quiet pill navigation, a narrow icon rail and floating rounded surfaces create clear access to financial context and deal work. Emerald, graphite and warm neutral tints retain the existing SWK OS brand.

The same surface language spans workspaces, dashboards, records, forms, dialogs and sign-in. Repository logos, icon marks and self-hosted fonts remain the only brand assets. The reference supplies composition; real API data and permission-filtered operational workflows supply the content.

**Key Characteristics:**
- Capsule navigation and circular shortcuts.
- Light neutral canvas, white floating surfaces and restrained brand tints.
- Readable operating tables and wrapping labels.
- Equal access to owner figures and operational actions.

## Colors

SWK OS emerald leads actions; deep fold green anchors the cash card and first workspace card. Emerald and fold green identify active primary navigation and workspace shortcuts; graphite remains available for strong secondary actions. Signal red remains reserved for errors and destructive operations. Ocean, teal, aviation, copper and violet preserve module and chart meanings; existing pastel status colours remain available.

The light canvas, white surfaces, soft green and champagne tints create tonal separation. Ink, body and muted establish the reading hierarchy; line colours divide data and outline fields. Reverse-muted labels support green cards. Dark mode keeps semantic variable overrides from the stylesheets, including the dark canvas and card surfaces; use variables for shared surfaces.

**The Brand Continuity Rule.** Translate the reference composition using SWK OS's existing identity assets and palette.

## Typography

Self-hosted Plus Jakarta Sans supplies headings and financial emphasis; self-hosted Instrument Sans supplies body text, navigation and controls. RTL retains Noto Sans Arabic. The frontmatter records the effective shared hierarchy. Numeric data uses tabular figures. Dashboard and welcome titles use display; other page titles use headline; workspace names use title. Dense tables use smaller text (12.5px cells, 11px headers), while financial totals grow responsively.

## Layout

The application occupies the viewport edge-to-edge with no inset frame, rounding or frame shadow. A light header contains brand, primary pills, notifications, command search and account access. A narrow shortcut rail (74px) links to permission-filtered workspaces. The main pane scrolls independently; the quiet status footer remains separate. Default main padding is (20px 32px 40px 20px), widening above (1600px).

Workspace cards use three columns by default, two at narrower widths and one below (640px); feature cards retain their responsive grid. Cards grow with content; workspace minimum height is (230px), reducing to (215px) on small screens. The dashboard overview uses three unequal columns, becomes two below (1200px), then stacks below (640px). Metrics use four, three and two columns through their responsive states; the existing narrow-screen single-column rule remains below (360px).

Below (640px), the shortcut rail disappears and primary pills form a visible full-width header row. Main padding becomes (18px 14px 30px). Tables scroll within their containers: entity tables keep a minimum width of (1080px); general mobile table wrappers keep (680px). Forms preserve responsive field grids and independently scrolling modal bodies with separate action footers. Breadcrumbs and long user values wrap.

## Elevation & Depth

Depth comes from tinted ground and restrained diffuse green shadows. Resting cards use the raised surface shadow; workspace hover, sign-in and expanded demo details use the floating shadow. The viewport frame and header remain flat. The cash surface has its own subtle green lift. Print removes surface shadows.

State transitions use the existing fast duration (180ms) and ease curve. Preserve keyboard focus rings. Reduced-motion rules shorten animations and transitions, disable account tilt and printer motion, and remove smooth main scrolling. Printer motion follows real document loading.

**The Surface Lift Rule.** Reserve diffuse lift for surfaces and state; keep the surrounding application canvas quiet.

## Shapes

Shared cards, panels and dialogs use soft surface corners; fields use the smaller field radius. Primary navigation, buttons, tabs and search use capsule silhouettes; icon shortcuts use circles. Record grouping retains its larger outer corners. The frame remains square and uncluttered. Borders are quiet field and data dividers rather than heavy card outlines.

## Components

### Buttons and inputs

Buttons are compact capsules with a shared minimum height (40px), small controls (34px), and circular icon variants. Primary uses emerald; dark uses graphite; outline uses white with the strong divider; ghost uses transparent ground. Hover changes brightness or soft surface and active presses move down (1px). Disabled controls retain opacity and interaction restrictions. Fields use visible labels, minimum height (42px), and emerald border plus translucent ring on focus; errors use signal red. Read-only fields use soft ground.

### Navigation and tabs

Primary pills are white at rest and emerald with white text when active. Rail shortcuts use fold green with white text when active. A shared Back button precedes each working section, including Workspaces and Dashboard. It returns through in-app history; a direct entry falls back to the related workspace, the workspace index, or Dashboard from the index. Printed documents omit this navigation. Hover uses soft ground and emerald emphasis. Accessible names remain on icon-only controls. Record tabs use soft grouping ground and graphite active capsules. Search keeps Ctrl/Cmd+K access.

### Workspace and feature cards

The Home launcher uses compact horizontal app cards (21st.dev feature-08 pattern: hairline rails, corner crosshairs, pointer spotlight): a 46px SWK brand tile (deep petrol body, crest-gold glyph), the app name, a one-line blurb and an arrow cue, in up to four columns. Sidebar app icons use the same Lucide glyph as the tile. Search lists matching pages above the grid and keeps a clear empty-state action.

### Dashboard operating desk

The dashboard uses neutral surfaces and dividers, with emerald action/navigation accents and red urgent-exception icons. The default view prioritizes key figures, all actionable alerts, upcoming closings and latest deals. Deal workflow guidance, AI briefings and detailed business reports use keyboard-accessible disclosure sections, collapsed by default. Duplicate financial overview cards are removed. Chart series use restrained grey/green tones and labels. Finance view permission gates financial metrics and charts. Light and dark themes retain readable contrast.

### Status chips, tables and dialogs

Chips remain small capsules with existing semantic status colours. Table headers use neutral ground, muted labels and thin dividers; numeric values stay legible in contained horizontal scrolling. Dialog corners match surfaces, with scrolling field content separated from footer actions. Demo status is a compact tinted strip with expandable details, preserving isolation and reset behaviour.

### Sign-in and brand

Sign-in uses an existing brand-green panel and a floating white form. Existing repository logos and route pattern remain intact; no new imagery is introduced. Preserve the verified PNG-derived favicon separately from the SVG icon asset used by current page illustrations. Print keeps existing document content and A4 geometry while excluding shell navigation and loading visuals.

## Do's and Don'ts

### Do:
- **Do** use the supplied SWK Properties assets, fonts and brand palette.
- **Do** derive navigation and displayed figures from permitted metadata and actual API data.
- **Do** keep table scrolling inside its surface and labels able to wrap.
- **Do** keep keyboard focus visible and respect reduced motion.
- **Do** preserve existing routes, task actions, demo isolation and print document content.

### Don't:
- **Don't** substitute reference branding, stock imagery or invented financial figures.
- **Don't** hide permitted tasks behind workspace previews.
- **Don't** turn the narrow shortcut rail into a competing full module sidebar.
- **Don't** clip operational fields or hide modal actions inside scrolling field content.
- **Don't** redraw the verified favicon mark; retain exports from public/brand/icon-primary.png.

### Company calendar

The calendar is an operating surface using Month, Week, Day and Agenda views. Emerald identifies selection, today and scheduling actions; module colors identify event groups with text labels and a filterable legend. Event chips use matching pastel backgrounds and dark text; dark mode uses tinted dark surfaces with light text. Red overdue and ochre due-soon labels remain separate from activity colors. The shared Back navigation and existing SWK OS assets remain visible.

A full selected-day schedule sits beside the desktop month/week board; on mobile, compact day counts lead to details below. Search, assignment, completion and deadline filters reduce dense schedules without hiding access to full records. Personal notifications occupy a separate alert panel. Civil date arithmetic follows the company timezone and preserves multi-day ranges. See docs/CALENDAR.md for coverage and behavior.
