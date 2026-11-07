import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumberField } from '@/panels/shared/NumberField';
import { findFamily, fallbackFamily } from '../store';
import { familyWeights, isVariableWeight, weightLabel, weightRange, WEIGHT_NAMES } from '../weights';

/** Weight select (named weights the family has) + a free number field for variable fonts. */
export function FontWeightField({ family, value, onChange }: { family: string | null; value: number | null; onChange: (w: number) => void }) {
  const info = (family && findFamily(family)) || fallbackFamily();
  const weights = familyWeights(info);
  const variable = isVariableWeight(info);
  const [min, max] = weightRange(info);
  const options = value !== null && !weights.includes(value) ? [...weights, value].sort((a, b) => a - b) : weights;
  return (
    <>
      <Select value={value === null ? '' : String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Font weight">
          <SelectValue placeholder="Mixed" />
        </SelectTrigger>
        <SelectContent>
          {options.map((w) => (
            <SelectItem key={w} value={String(w)}>
              {/* Variable fonts show the number in the field next to it: keep the select short. */}
              {variable ? (WEIGHT_NAMES[w] ?? String(w)) : weightLabel(w)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {variable && (
        <NumberField ariaLabel="Variable weight" className="w-20 shrink-0" value={value} min={min} max={max} step={10} precision={0} undoLabel="Font weight" onCommit={onChange} />
      )}
    </>
  );
}
