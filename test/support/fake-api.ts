// A stand-in Safelight API over real React and zustand, with the pieces the
// extension touches: the develop store, the capture and photo-data calls
// (recorded), mask kind registration and the core Slider and Button.

import * as React from "react";
import { vi, type Mock } from "vitest";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  DevelopParams,
  EditState,
  FloatCaptureOptions,
  FloatFrame,
  Mask,
  MaskComponent,
  MaskComponentKindContribution,
  SafelightAPI,
  SliderProps,
} from "../../src/safelight";

export const FUZZY_TYPE = "fuzzy-select.fuzzy";
export const WIDTH = 10;
export const HEIGHT = 4;

export interface RigState {
  photoId: string | null;
  params: DevelopParams;
  history: unknown[];
  historyIndex: number;
  sourceSize: { width: number; height: number };
}

export interface Rig {
  api: SafelightAPI;
  develop: UseBoundStore<StoreApi<RigState>>;
  kinds: Map<string, MaskComponentKindContribution>;
  /** The key a capture and maskInputKey answer with. */
  inputKey: { current: string | null };
  finalSource: { current: boolean };
  captureFloatFrame: Mock<(params: DevelopParams, options?: FloatCaptureOptions & { maxEdge?: number }) => Promise<FloatFrame | null>>;
  renderPhotoFloatFrame: Mock<(photoId: string, params: DevelopParams, options?: FloatCaptureOptions) => Promise<FloatFrame | null>>;
  refreshMaskCoverage: Mock<(name: string) => void>;
  putPhotoData: Mock<(key: string, data: Uint8Array | null, photoId?: string) => void>;
  getPhotoData: Mock<(key: string, photoId?: string) => Promise<Uint8Array | null>>;
  editStates: Map<string, EditState>;
  storage: Map<string, Uint8Array>;
  sliders(root: ParentNode): SliderProps[];
  commit(): void;
}

export function component(id: string, values: Record<string, unknown>): MaskComponent {
  return { id, kind: "extension", mode: "add", invert: false, extension: { type: FUZZY_TYPE, values } };
}

export function maskWith(...components: MaskComponent[]): Mask {
  return { id: "m1", name: "Mask", visible: true, invert: false, opacity: 1, components } as unknown as Mask;
}

export function paramsWith(...masks: Mask[]): DevelopParams {
  return { masks } as unknown as DevelopParams;
}

/** Left half red, right half blue; row 0 = v 0. */
export function twoToneFrame(key: string | null, finalSource: boolean): FloatFrame {
  const data = new Float32Array(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) data.set(i % WIDTH < WIDTH / 2 ? [1, 0, 0, 1] : [0, 0, 1, 1], i * 4);
  const frame: FloatFrame = { data, width: WIDTH, height: HEIGHT, space: "linear-rec709" as unknown as FloatFrame["space"], point: "mask", finalSource };
  if (key !== null) frame.inputKey = key;
  return frame;
}

export function fakeRig(params: DevelopParams = paramsWith(), photoId: string | null = "p1"): Rig {
  const develop = create<RigState>(() => ({
    photoId,
    params,
    history: [],
    historyIndex: 0,
    sourceSize: { width: 0, height: 0 },
  }));
  const kinds = new Map<string, MaskComponentKindContribution>();
  const inputKey = { current: "k1" as string | null };
  const finalSource = { current: true };
  const storage = new Map<string, Uint8Array>();
  const editStates = new Map<string, EditState>();
  const sliderProps = new Map<number, SliderProps>();
  let nextSlider = 0;

  const captureFloatFrame: Rig["captureFloatFrame"] = vi.fn(async () => twoToneFrame(inputKey.current, finalSource.current));
  const renderPhotoFloatFrame: Rig["renderPhotoFloatFrame"] = vi.fn(async () => twoToneFrame("closed-key", true));
  const refreshMaskCoverage: Rig["refreshMaskCoverage"] = vi.fn();
  const slot = (key: string, id?: string) => `${id ?? develop.getState().photoId}/${key}`;
  const putPhotoData: Rig["putPhotoData"] = vi.fn((key, data, id) => {
    if (data === null) storage.delete(slot(key, id));
    else storage.set(slot(key, id), data);
  });
  const getPhotoData: Rig["getPhotoData"] = vi.fn(async (key, id) => storage.get(slot(key, id)) ?? null);

  function Slider(props: SliderProps) {
    const id = React.useRef(nextSlider++).current;
    sliderProps.set(id, props);
    return React.createElement("div", { "data-slider": id }, `${props.label} ${props.value}`);
  }

  const api = {
    version: 1,
    extensionId: "fuzzy-select",
    react: React,
    components: { Slider },
    ui: {
      Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", { type: "button", ...props }),
    },
    stores: { useDevelopStore: develop },
    catalog: { getEditState: async (id: string) => editStates.get(id) ?? null },
    develop: {
      registerMaskComponentKind: (kind: MaskComponentKindContribution) => void kinds.set(kind.name, kind),
      unregisterMaskComponentKind: (name: string) => void kinds.delete(name),
      refreshMaskCoverage,
      maskInputKey: async () => inputKey.current,
      captureFloatFrame,
      renderPhotoFloatFrame,
      putPhotoData,
      getPhotoData,
    },
  } as unknown as SafelightAPI;

  return {
    api,
    develop,
    kinds,
    inputKey,
    finalSource,
    captureFloatFrame,
    renderPhotoFloatFrame,
    refreshMaskCoverage,
    putPhotoData,
    getPhotoData,
    editStates,
    storage,
    sliders: (root) =>
      [...root.querySelectorAll("[data-slider]")].map((el) => {
        const props = sliderProps.get(Number(el.getAttribute("data-slider")));
        if (!props) throw new Error("a slider without props");
        return props;
      }),
    commit: () => develop.setState((s) => ({ history: [...s.history, {}], historyIndex: s.historyIndex + 1 })),
  };
}
