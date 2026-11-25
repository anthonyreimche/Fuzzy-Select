import type { MaskComponentControlsProps } from "./safelight";
import { React, api } from "./rt";
import { DEFAULT_FEATHER, DEFAULT_TOLERANCE, normaliseValues } from "./fill";

export function FuzzyControls({ values, setValues, commit }: MaskComponentControlsProps) {
  const { Slider } = api.components;
  const { Button } = api.ui;
  const { tolerance, feather, seeds } = normaliseValues(values);
  return (
    <div className="flex flex-col gap-2">
      <div title="How different a colour can be from the clicked point and still be selected">
        <Slider
          label="Tolerance"
          value={tolerance}
          min={0}
          max={100}
          step={1}
          defaultValue={DEFAULT_TOLERANCE}
          onChange={(v) => setValues({ tolerance: v })}
          onCommit={() => commit("Fuzzy Select Tolerance")}
        />
      </div>
      <div title="Softens the edge of the selection">
        <Slider
          label="Feather"
          value={feather}
          min={0}
          max={100}
          step={1}
          defaultValue={DEFAULT_FEATHER}
          onChange={(v) => setValues({ feather: v })}
          onCommit={() => commit("Fuzzy Select Feather")}
        />
      </div>
      <Button
        size="sm"
        disabled={seeds.length === 0}
        title="Remove every clicked point from this component"
        onClick={() => {
          setValues({ seeds: [] });
          commit("Clear Fuzzy Select Points");
        }}
      >
        Clear points
      </Button>
    </div>
  );
}
