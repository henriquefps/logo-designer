# System-themed app icons: Android themed, iOS 18 Dark / Tinted, iOS 26 Icon Composer

What the OS does when it recolours app icons, what the icon set exports for each case, and where
each rule comes from. The code is in `src/icon/` (`rules.ts`, `outputs.ts`, `iconSet.ts`); the
approximate previews are in `src/iconMode/themedPreview.ts` and `src/iconMode/ui/ThemedPreview.tsx`.
Researched 2026-11-10.

## Sources

| What | Source |
| --- | --- |
| iOS 18 dark/tinted: "Provide your tinted app icon as a grayscale image. Provide your dark app icon with a transparent background so the system-provided background can show through." | Apple, *Configuring your app icon using an asset catalog*, section "Add dark and tinted icon variants to iOS and iPadOS": https://developer.apple.com/documentation/xcode/configuring-your-app-icon |
| Appearances (default, dark, clear light/dark, tinted light/dark), 1024 × 1024 layout, colour spaces (sRGB, Gray Gamma 2.2, Display P3), layered Icon Composer files vs. bitmap (system segments a bitmap into 2 layers) | Apple HIG, *App icons*: https://developer.apple.com/design/human-interface-guidelines/app-icons |
| Icon Composer: SVG or PNG layers at the 1024 canvas, back to front, no background layer (background is a fill), no mask, max 4 groups; drag the `.icon` into Xcode and set *App Icon* to its name; Xcode builds older-iOS images from it and it replaces the `AppIcon` asset catalog | Apple, *Creating your app icon using Icon Composer*: https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer |
| Tinted = "a fully opaque grayscale image"; the system provides the background gradient | Create with Swift, *Preparing your App Icon for dark and tinted appearance*: https://www.createwithswift.com/preparing-your-app-icon-for-dark-and-tinted-appearance/ |
| `Contents.json` `appearances` entries as written by a real exporter: `{"appearance":"luminosity","value":"dark"}` / `"tinted"` on a universal 1024 image | Godot engine iOS exporter: https://github.com/godotengine/godot/blob/master/editor/export/editor_export_platform_apple_embedded.cpp (search `luminosity`) |
| `icon.json` schema (real files saved by Icon Composer) | mastodon-ios `AppIcon.icon` (solid fill, SVG layer, `hidden-specializations`): https://github.com/mastodon/mastodon-ios/tree/develop/AppIcon.icon · BookPlayer `AppIcon.icon` (`fill-specializations` with `dark`/`tinted`, `extended-gray`, `glass`, `blend-mode-specializations`): https://github.com/TortugaPower/BookPlayer/tree/develop/AppIcon.icon · swiftDialog (top-level `fill-specializations` with `linear-gradient` and a `dark` specialization): https://github.com/swiftDialog/swiftDialog/tree/main/swiftDialog.icon · Xit (`automatic-gradient`, `specular`, `lighting`): https://github.com/Uncommon/Xit/tree/master/Xit/Xit.icon · RepoBar (`"fill": "automatic"`, PNG layer): https://github.com/steipete/RepoBar/tree/main/Icon.icon |

Apple's documentation pages are rendered with JavaScript; their text was read from the DocC JSON
behind them (`https://developer.apple.com/tutorials/data/documentation/xcode/configuring-your-app-icon.json`,
`…/creating-your-app-icon-using-icon-composer.json`, `…/tutorials/data/design/human-interface-guidelines/app-icons.json`).

## Android 13+ themed icons (unchanged, preview only)

The adaptive icon XML already has `<monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>`,
and `ic_launcher_monochrome.png` is the glyph alone (black on transparency, same 108/72 dp keylines as
the foreground) at every density. The launcher uses only its alpha and tints it from the wallpaper
palette: a dark tone on a light tonal shape in light mode, a light tone on a dark tonal shape in
dark mode. Nothing to export; the panel shows an approximation.

## iOS 18+: `AppIcon.appiconset` with Light / Dark / Tinted

`ios/AppIcon.appiconset/`:

| File | Appearance | Content |
| --- | --- | --- |
| `AppIcon-1024.png` | Any (Light) | unchanged: opaque RGB, brand blue square, white glyph on the 1024 keyline |
| `AppIcon-1024-dark.png` | `luminosity: dark` | RGBA: **transparent** background, glyph in `IOS_DARK_GLYPH` `#5b9ae1` (brand blue lifted to 62% lightness so it reads on the system's near-black). With a custom tile (`--tile`, `icon.tile`) the glyph is derived the same way: the tile's HSL hue and saturation, rounded to whole degrees / percent, at 62% lightness (`iosDarkGlyphFor()`; `#2063b0` = HSL 212°, 69%, 41% gives exactly `#5b9ae1`, olive `#5b7a3a` gives `#9fc17b`). Apple: transparent "so the system-provided background can show through"; HIG: dark icons "more subdued", "avoid excessively bright images". |
| `AppIcon-1024-tinted.png` | `luminosity: tinted` | opaque RGB grayscale: **white glyph on black**. Apple: "grayscale image"; the system recolours it with the tint (white → full tint) over its own gradient. |

`Contents.json`:

```json
{
  "images": [
    { "filename": "AppIcon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024" },
    { "appearances": [{ "appearance": "luminosity", "value": "dark" }], "filename": "AppIcon-1024-dark.png", "idiom": "universal", "platform": "ios", "size": "1024x1024" },
    { "appearances": [{ "appearance": "luminosity", "value": "tinted" }], "filename": "AppIcon-1024-tinted.png", "idiom": "universal", "platform": "ios", "size": "1024x1024" }
  ],
  "info": { "author": "hfps build-icons", "version": 1 }
}
```

Verified with Xcode's own compiler on this Mac: `xcrun actool Assets.xcassets --compile out
--platform iphoneos --minimum-deployment-target 18.0 --app-icon AppIcon` compiles with no warnings,
and `assetutil --info out/Assets.car` lists the three 1024 renditions with appearances
`UIAppearanceDark` and `ISAppearanceTintable`.

## iOS 26: Icon Composer `AppIcon.icon`

The schema is confirmed from five real files saved by Icon Composer (sources above), so the export
is generated directly (no manual assembly step):

```
ios/AppIcon.icon/
  icon.json
  Assets/glyph.svg      1024 × 1024 canvas, transparent, white glyph at the 1024 keyline, no mask
```

`icon.json`:

```json
{
  "fill-specializations": [
    { "value": { "solid": "srgb:0.12549,0.38824,0.69020,1.00000" } },
    { "appearance": "dark", "value": { "linear-gradient": ["srgb:0.22745,0.22745,0.23529,1.00000", "srgb:0.08627,0.08627,0.09412,1.00000"] } }
  ],
  "groups": [
    {
      "layers": [
        {
          "fill-specializations": [
            { "appearance": "dark", "value": { "solid": "srgb:0.35686,0.60392,0.88235,1.00000" } },
            { "appearance": "tinted", "value": { "solid": "extended-gray:1.00000,1.00000" } }
          ],
          "glass": true,
          "image-name": "glyph.svg",
          "name": "glyph",
          "position": { "scale": 1, "translation-in-points": [0, 0] }
        }
      ],
      "name": "Glyph",
      "shadow": { "kind": "neutral", "opacity": 0.5 },
      "translucency": { "enabled": true, "value": 0.5 }
    }
  ],
  "supported-platforms": { "circles": ["watchOS"], "squares": "shared" }
}
```

What each key means (from the examples and Apple's Icon Composer guide):

- **Background** is not a layer: it is the document `fill` (`"automatic"`, `{ "solid": colour }`,
  `{ "automatic-gradient": colour }`, `{ "linear-gradient": [from, to] }`) or `fill-specializations`
  (a list of `{ appearance?, value }`; no `appearance` = default; `appearance` is `dark` or `tinted`).
- **Colours** are strings: `srgb:r,g,b,a`, `display-p3:r,g,b,a`, `extended-gray:white,a`, 5 decimals.
- **groups** (max 4) hold **layers**; Icon Composer's defaults on a new group are
  `shadow: { kind: neutral, opacity: 0.5 }` and `translucency: { enabled: true, value: 0.5 }`.
  Optional group keys seen: `specular` (bool), `blur-material`, `lighting` (`individual`/`combined`),
  `position`.
- **layer**: `image-name` (a file in `Assets/`, SVG or PNG), `name`, `glass` (Liquid Glass on),
  `position: { scale, translation-in-points: [x, y] }` (SVG size is in points; a 1024-point SVG at
  scale 1 fills the canvas), and `*-specializations` for `fill`, `opacity`, `blend-mode`, `hidden`,
  `position` (by `appearance` or `idiom`).
- **supported-platforms**: `squares` (`"shared"` = iOS + macOS, or a list) and `circles` (`["watchOS"]`).
  This is what Icon Composer writes for a new document.

Our choices: brand blue background by default and a dark gradient in Dark (close to the iOS 18 dark
tile), the glyph in `IOS_DARK_GLYPH` in Dark (same as the `.appiconset` dark PNG) and white
(`extended-gray:1`) in Tinted, so the system's tint is applied to a full-white glyph. Clear
appearances are left to the system.

Verified with Apple's tools on this Mac (Xcode 26, Icon Composer 1.6):

- `ictool AppIcon.icon --export-image --platform iOS --rendition <R> --width 256 --height 256 --scale 1`
  renders all six renditions (`Default`, `Dark`, `ClearLight`, `ClearDark`, `TintedLight`,
  `TintedDark`) with the glyph on the keyline: blue glass tile with a white glyph; dark tile with
  the light-blue glyph; frosted clear tiles; tinted tiles in the tint colour.
- `xcrun actool AppIcon.icon --compile out --platform iphoneos --minimum-deployment-target 18.0
  --app-icon AppIcon` compiles it; `Assets.car` contains Light, Dark and Tintable renditions plus
  the vector layer, and the pre-26 PNGs (`AppIcon60x60@2x.png`, `AppIcon76x76@2x~ipad.png`).

Using it: drag `AppIcon.icon` into the Xcode project, and in the target's *General → App Icons and
Launch Screen* make *App Icon* = `AppIcon`. Xcode 26 then uses it instead of the asset catalog's
`AppIcon` and generates images for older iOS. Keep the `.appiconset` for projects built with older
Xcode. Open the file in Icon Composer to tweak glass, specular or the dark gradient.

## Previews in the Icon panel ("System themes")

Approximations, labelled as such in the UI; one **Tint** colour drives both the iOS tint and the
Android wallpaper accent (stored in `designer.icon` in localStorage):

- **Android 13+ themed, Light / Dark**: the glyph on a circle; light = tone ~90% lightness shape
  with a ~20% glyph, dark = ~20% shape with a ~86% glyph, both in the tint's hue (Material You
  tones approximated in HSL).
- **iOS 18+, Light / Dark / Tinted**: rounded tile (corner ≈ 22.4%); Light = the exported tile;
  Dark = `IOS_DARK_GLYPH` on the `#3a3a3c → #161618` gradient; Tinted = the glyph in the tint on a
  dark gradient shaded with the tint's hue.
