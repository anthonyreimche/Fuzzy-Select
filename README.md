# Fuzzy Select

Select a connected area of similar colour with a click, as a mask component.

## Use

1. In Masking, pick **Fuzzy Select** from **Create Mask** (or a mask's **Add Component** menu).
2. Click the photo to select the connected area of similar colour around the point.
3. Click again to add another area. Alt-click to subtract an area from the selection.
4. **Tolerance** sets how different a colour may be from the clicked point and still be selected. **Feather** softens the edge of the selection.
5. **Clear points** removes every clicked point from the component.

Up to 64 points per component. The selection follows the photo's colour as it stands before the masks (exposure, white balance and any denoising), and is filled again when an edit changes that colour.

## Requirements

Safelight 3.2.8 and Masking 3.1.0.

## How it saves

Each component's selection is kept with the photo (as the `regions` data) so it is there as soon as the photo opens, and for exports and batches of photos that are not open.
