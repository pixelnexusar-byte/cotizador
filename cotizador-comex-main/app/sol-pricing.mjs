export const solModes = {
  courier: { label: 'Courier aéreo', rate: 20, unit: 'kg real' },
  grupo: { label: 'Marítimo Importa en Grupo', rate: 5, unit: 'kg real' },
  lcl: { label: 'Marítimo LCL', rate: 400, unit: 'm³' },
  all: { label: 'All Inclusive fijo', rate: 2335, unit: 'servicio' }
};

export const solDefaults = {
  rates: Object.fromEntries(Object.entries(solModes).map(([mode, { rate }]) => [mode, rate])),
  insurance: 3,
  taxes: 65,
  fee: 35,
  minKg: 45,
  maxKg: 400,
  maxCbm: 2,
  enabled: {
    freight: true,
    insurance: true,
    taxes: true,
    fee: true,
    all: true
  },
  labels: {
    freight: 'Flete internacional',
    insurance: 'Seguro estimado',
    taxes: 'Impuestos y Aduana',
    fee: 'Honorarios DCAM',
    all: 'Servicio All Inclusive'
  },
  customItems: []
};

const round = value => Math.round(value * 100) / 100;
const valid = value => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

export function calculateSol({ mode, settings, goods, weight, volume }) {
  const fob = Number(goods);
  const kg = Number(weight);
  const cbm = Number(volume);
  const fixed = mode === 'all';

  const enabled = { ...solDefaults.enabled, ...(settings.enabled || {}) };
  const labels = { ...solDefaults.labels, ...(settings.labels || {}) };
  const customItems = Array.isArray(settings.customItems) ? settings.customItems : [];

  // Regla de tarifas por volumen según m3 (> 3 m3 baja a 300 USD/m3)
  let activeRate = settings.rates[mode];
  if (mode === 'lcl' && cbm > 3) {
    activeRate = 300;
  }

  const quantity = fixed ? 1 : mode === 'lcl' ? cbm : kg;

  if (!valid(goods) || fob <= 0) return { error: 'Ingresá el valor FOB total en USD.' };
  if ([weight, volume].some(value => value !== '' && !valid(value))) {
    return { error: 'Ingresá un peso y un volumen válidos.' };
  }

  if (fixed && kg > 0 && kg < 300 && cbm > 0 && cbm < 0.5) {
    return { error: 'Para cargas menores a 300 kg y 0.5 m³, la regla operacional indica cotizar Marítimo por m³ o Courier.' };
  }

  const chargesToValidate = fixed
    ? (enabled.all ? [activeRate] : [])
    : [
        ...(enabled.freight ? [activeRate] : []),
        ...(enabled.insurance ? [settings.insurance] : []),
        ...(enabled.taxes ? [settings.taxes] : []),
        ...(enabled.fee ? [settings.fee] : [])
      ];

  if (!chargesToValidate.every(valid)) {
    return { error: 'Completá las tarifas y los porcentajes habilitados con valores válidos.' };
  }

  const lines = [];

  if (fixed) {
    if (enabled.all) {
      lines.push({
        key: 'all',
        label: labels.all?.trim() || solDefaults.labels.all,
        detail: 'Flete, aduana y honorarios hasta Sarandí',
        amount: round(+activeRate)
      });
    }
  } else {
    if (enabled.freight) {
      lines.push({
        key: 'freight',
        label: labels.freight?.trim() || solDefaults.labels.freight,
        detail: `${quantity} ${solModes[mode].unit} × USD ${activeRate}`,
        amount: round(quantity * +activeRate)
      });
    }
    if (enabled.insurance) {
      lines.push({
        key: 'insurance',
        label: labels.insurance?.trim() || solDefaults.labels.insurance,
        detail: `${settings.insurance}% del FOB`,
        amount: round(fob * (+settings.insurance / 100))
      });
    }
    if (enabled.taxes) {
      lines.push({
        key: 'taxes',
        label: labels.taxes?.trim() || solDefaults.labels.taxes,
        detail: `${settings.taxes}% del FOB (Estimado)`,
        amount: round(fob * (+settings.taxes / 100))
      });
    }
    if (enabled.fee) {
      lines.push({
        key: 'fee',
        label: labels.fee?.trim() || solDefaults.labels.fee,
        detail: 'Gestión integral',
        amount: round(+settings.fee)
      });
    }
  }

  for (const item of customItems) {
    if (!item.enabled) continue;
    const amount = valid(item.amount) ? round(+item.amount) : 0;
    lines.push({
      key: item.id,
      label: item.label?.trim() || 'Ítem adicional',
      detail: 'Adicional',
      amount
    });
  }

  const service = round(lines.reduce((total, line) => total + line.amount, 0));
  return {
    lines,
    fob: round(fob),
    service,
    total: round(round(fob) + service)
  };
}