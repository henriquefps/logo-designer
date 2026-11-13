# Port notes: system-themed iOS icons → `build-icons.mjs`

What `~/.agents/skills/hfps-kit/repo-assets/assets/build-icons.mjs` needs so it produces the same files
as `src/icon/` again (iOS 18 Dark/Tinted variants and the iOS 26 Icon Composer file). The TS
source is `src/icon/rules.ts` (constants), `src/icon/outputs.ts` (`IOS_APPICON`,
`IOS_CONTENTS_JSON`, `iosDarkSvg`, `iosTintedSvg`, `icSrgb`, `iconComposerGlyphSvg`,
`iconComposerJson`) and `src/icon/iconSet.ts` (`addIosAppIconSet`, `addIconComposerFile`). Why each
choice: `docs/app-icons-theming.md`.

Android needs no change (the monochrome layer already exists).

## 1. Constants (next to `BRAND`, `LIGHT_BORDER`)

```js
// iOS 18 appearances and the iOS 26 Icon Composer file (docs/app-icons-theming.md in logo-designer).
const IOS_DARK_GLYPH = '#5b9ae1'; // brand blue at 62% lightness: glyph of the Dark variant
const IOS_TINTED_GLYPH = '#ffffff', IOS_TINTED_BG = '#000000'; // Tinted: opaque grayscale
const IOS_DARK_BG = ['#3a3a3c', '#161618']; // Icon Composer dark background gradient, top → bottom
const IC_CANVAS = 1024; // Icon Composer canvas for iPhone / iPad / Mac
```

## 2. Replace the `// ---- iOS ----` block

```js
// ---- iOS ----
// iOS 18+: Light = opaque brand tile (no alpha); Dark = glyph on TRANSPARENCY (the system draws the
// dark background); Tinted = opaque grayscale, white glyph on black (the system tints it).
// iOS 26: AppIcon.icon (Icon Composer): background is a fill, the glyph one SVG layer on the 1024 canvas.
if (ios) {
  const dir = join(ios, 'AppIcon.appiconset');
  const name = { light: 'AppIcon-1024.png', dark: 'AppIcon-1024-dark.png', tinted: 'AppIcon-1024-tinted.png' };
  await write(dir, name.light, await sharp(await png(tileSvg({ rx: 0 }), 1024)).flatten({ background: BRAND }).removeAlpha().png().toBuffer());
  const darkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024">${glyphG(glyphSrc, big, 128, KL.long, IOS_DARK_GLYPH)}</svg>`;
  await write(dir, name.dark, await png(darkSvg, 1024));
  const tintedSvg = tileSvg({ rx: 0, bg: IOS_TINTED_BG, color: IOS_TINTED_GLYPH, size: 1024 });
  await write(dir, name.tinted, await sharp(await png(tintedSvg, 1024)).flatten({ background: IOS_TINTED_BG }).removeAlpha().png().toBuffer());
  const lum = (value) => ({ appearances: [{ appearance: 'luminosity', value }] });
  await write(dir, 'Contents.json', JSON.stringify({
    images: [
      { filename: name.light, idiom: 'universal', platform: 'ios', size: '1024x1024' },
      { ...lum('dark'), filename: name.dark, idiom: 'universal', platform: 'ios', size: '1024x1024' },
      { ...lum('tinted'), filename: name.tinted, idiom: 'universal', platform: 'ios', size: '1024x1024' },
    ],
    info: { author: 'hfps build-icons', version: 1 },
  }, null, 2) + '\n');

  // iOS 26 Icon Composer file
  const icDir = join(ios, 'AppIcon.icon');
  const srgb = (hex, a = 1) => 'srgb:' + [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(5)).join(',') + ',' + a.toFixed(5);
  await write(join(icDir, 'Assets'), 'glyph.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${IC_CANVAS} ${IC_CANVAS}" width="${IC_CANVAS}" height="${IC_CANVAS}">` +
    glyphG(glyphSrc, big, IC_CANVAS, KL.long, '#ffffff') + `</svg>`);
  await write(icDir, 'icon.json', JSON.stringify({
    'fill-specializations': [
      { value: { solid: srgb(BRAND) } },
      { appearance: 'dark', value: { 'linear-gradient': IOS_DARK_BG.map((c) => srgb(c)) } },
    ],
    groups: [{
      layers: [{
        'fill-specializations': [
          { appearance: 'dark', value: { solid: srgb(IOS_DARK_GLYPH) } },
          { appearance: 'tinted', value: { solid: 'extended-gray:1.00000,1.00000' } },
        ],
        glass: true,
        'image-name': 'glyph.svg',
        name: 'glyph',
        position: { scale: 1, 'translation-in-points': [0, 0] },
      }],
      name: 'Glyph',
      shadow: { kind: 'neutral', opacity: 0.5 },
      translucency: { enabled: true, value: 0.5 },
    }],
    'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
  }, null, 2) + '\n');
}
```

Notes for the port:

- Key order in `icon.json` and `Contents.json` must stay as above for byte parity with Designer
  (`JSON.stringify(…, null, 2) + '\n'`).
- The Tinted PNG in Designer goes through `encodeOpaquePng` with `IOS_TINTED_BG`: `sharp …
  .flatten({ background: '#000000' }).removeAlpha()` is the equivalent (8-bit RGB, no alpha).
- The Dark PNG keeps its alpha channel (RGBA): no flatten.
- `glyphG` already exists in the script with the signature `(src, box, T, fill, color, ox, oy)`.

## 3. Header comment and usage

```
//   --ios <dir>      AppIcon.appiconset (iOS 18+: Light opaque 1024, Dark on transparency, Tinted
//                    grayscale, Contents.json with "luminosity" appearances) and AppIcon.icon
//                    (iOS 26 Icon Composer: icon.json + Assets/glyph.svg)
```

## 4. SKILL.md ("The icon: rules" → iOS bullet, and the `--ios` line)

Replace the iOS bullet with:

> - **iOS.** `AppIcon.appiconset` with three 1024 px images: **Light** fully opaque (square, no
>   rounded corners, no transparency: iOS applies its own mask); **Dark** = the glyph in `#5b9ae1`
>   on a transparent background (iOS draws its dark background); **Tinted** = opaque grayscale,
>   white glyph on black (iOS tints it). Same keylines on T = 1024. Plus `AppIcon.icon` for iOS 26
>   (Icon Composer: brand fill, dark gradient in Dark, the glyph as one Liquid Glass SVG layer on the
>   1024 canvas). Drag `AppIcon.icon` into Xcode 26 and set *App Icon* = `AppIcon`.

and the `--ios` line with: "`--ios`: writes `AppIcon.appiconset` (Light / Dark / Tinted 1024 PNGs +
`Contents.json`) and `AppIcon.icon` (Icon Composer)."

## 5. Check after porting

```sh
node build-icons.mjs glyph-sync.svg /tmp/d --ios /tmp/ios
designer icons sync.designer.json -o /tmp/designer-icons   # same glyph
diff /tmp/ios/AppIcon.appiconset/Contents.json /tmp/designer-icons/ios/AppIcon.appiconset/Contents.json
diff /tmp/ios/AppIcon.icon/icon.json /tmp/designer-icons/ios/AppIcon.icon/icon.json
```

The PNGs differ by a few anti-aliasing levels (sharp vs resvg), like the existing outputs.
