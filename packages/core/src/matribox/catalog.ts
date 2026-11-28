/**
 * The Matribox II Pro model catalog, built in: models.json is our functional map of the unit's
 * models (ids, categories, the gear each is based on, parameter ranges; written by
 * scripts/matribox-map.mjs, schema there and in docs/matribox.md), and model-text.json our own
 * names and descriptions, keyed "MODULE:fxid".
 */
import mapJson from './models.json' with { type: 'json' };
import textJson from './model-text.json' with { type: 'json' };
import unitsJson from './units.json' with { type: 'json' };

export interface MbParam {
  readonly name: string;
  readonly id: number;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** A switch's or list's label for each step, from min. */
  readonly options?: readonly string[];
  /** The unit of the value ("ms", "Hz", "st", "cents", "%"); absent when the unit is not certain. */
  readonly unit?: string;
}

/** A text in each language of the UI. */
export interface MbText {
  readonly en: string;
  readonly pt: string;
}

export interface MbModel {
  readonly fxid: number;
  readonly index: number;
  /** Our short name for the model. */
  readonly name: string;
  /** Category, groups the model menus; '' when none. */
  readonly type: string;
  /** The real gear the model is based on; '' when none. */
  readonly basedOn: string;
  readonly description: MbText;
  readonly params: readonly MbParam[];
}

export interface MbModule {
  readonly name: string;
  readonly index: number;
  readonly models: readonly MbModel[];
}

export interface MbCatalog {
  readonly modules: readonly MbModule[];
}

/** models.json, as scripts/matribox-map.mjs writes it. */
export interface MbMap {
  readonly modules: readonly {
    readonly module: string;
    readonly index: number;
    readonly models: readonly {
      readonly fxid: number;
      readonly index: number;
      readonly type: string;
      readonly basedOn: string;
      readonly params: readonly {
        readonly id: number;
        readonly label: string;
        readonly min: number;
        readonly max: number;
        readonly step: number;
        readonly default: number;
        readonly options?: readonly string[];
      }[];
    }[];
  }[];
}

/** model-text.json: our name, the real gear (when known) and descriptions of each model, by "MODULE:fxid". */
export type MbTextMap = Readonly<Record<string, { readonly name: string; readonly gear?: string; readonly en: string; readonly pt: string }>>;

/**
 * units.json: the unit of a parameter, by "MODULE:Label" (every model of the module with that
 * control name), or "MODULE:fxid:Label" for one model, which wins. Kept apart from models.json so
 * that re-running scripts/matribox-map.mjs does not drop it. A parameter without an entry has no unit.
 */
export type MbUnits = Readonly<Record<string, string>>;

export const mbTextKey = (module: string, fxid: number) => `${module}:${fxid}`;

/**
 * The catalog of a map and its texts; a model without text is named "<MODULE> <index>" and described by its gear.
 * The gear is our text's `gear` when set, else the map's basedOn.
 */
export function mbCatalog(map: MbMap, text: MbTextMap, units: MbUnits = {}): MbCatalog {
  const modules = map.modules.map((m) => {
    const models = m.models.map((a) => {
      const own = text[mbTextKey(m.module, a.fxid)];
      const basedOn = own?.gear || a.basedOn;
      const params = a.params.map((p) => {
        const unit = units[`${m.module}:${a.fxid}:${p.label}`] ?? units[`${m.module}:${p.label}`];
        return Object.freeze({
          name: p.label,
          id: p.id,
          defaultValue: p.default,
          min: p.min,
          max: p.max,
          step: p.step,
          ...(p.options ? { options: Object.freeze([...p.options]) } : {}),
          ...(unit ? { unit } : {}),
        });
      });
      return Object.freeze({
        fxid: a.fxid,
        index: a.index,
        name: own?.name ?? `${m.module} ${a.index}`,
        type: a.type,
        basedOn,
        description: Object.freeze({ en: own?.en ?? basedOn, pt: own?.pt ?? basedOn }),
        params: Object.freeze(params),
      });
    });
    return Object.freeze({ name: m.module, index: m.index, models: Object.freeze(models) });
  });
  return Object.freeze({ modules: Object.freeze(modules) });
}

/** The built-in catalog: every module and model of the unit. */
export const MB_CATALOG: MbCatalog = mbCatalog(mapJson as MbMap, textJson as MbTextMap, unitsJson as MbUnits);
