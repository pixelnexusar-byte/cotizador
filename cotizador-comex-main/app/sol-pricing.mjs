export const solModes = {
  courier: { label: 'Courier aéreo', rate: 20, unit: 'kg real' },
  grupo: { label: 'Marítimo Importa en Grupo', rate: 5, unit: 'kg real' },
  lcl: { label: 'Marítimo LCL', rate: 400, unit: 'm³' },
  all: { label: 'All Inclusive fijo', rate: 2335, unit: 'servicio' }
};

export const solDefaults = {
  rates: Object.fromEntries(Object.entries(solModes).map(([mode, { rate }]) => [mode, rate])),
  insurance: 3, taxes: 65, fee: 35, minKg: 45, maxKg: 400, maxCbm: 2
};

const round = value => Math.round(value * 100) / 100;
const valid = value => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

export function calculateSol({ mode, settings, goods, weight, volume }) {
  const fob = Number(goods);
  const kg = Number(weight);
  const cbm = Number(volume);
  const fixed = mode === 'all';
  
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

  const charges = fixed ? [activeRate] : [activeRate, settings.insurance, settings.taxes, settings.fee];
  if (!charges.every(valid)) return { error: 'Completá las tarifas y los porcentajes con valores válidos.' };

  const freightAmount = fixed ? activeRate : round(quantity * +activeRate);
  const insuranceAmount = round(fob * (+settings.insurance / 100));
  const taxesAmount = fixed ? 0 : round(fob * (+settings.taxes / 100));
  const feeAmount = round(+settings.fee);

  const lines = fixed ? [
    { label: 'Servicio All Inclusive', detail: 'Flete, aduana y honorarios hasta Sarandí', amount: round(activeRate) }
  ] : [
    { label: 'Flete internacional', detail: `${quantity} ${solModes[mode].unit} × USD ${activeRate}`, amount: freightAmount },
    { label: 'Seguro estimado', detail: `${settings.insurance}% del FOB`, amount: insuranceAmount },
    { label: 'Impuestos y Aduana', detail: `${settings.taxes}% del FOB (Estimado)`, amount: taxesAmount },
    { label: 'Honorarios DCAM', detail: 'Gestión integral', amount: feeAmount }
  ];

  const service = round(lines.reduce((total, line) => total + line.amount, 0));
  return { 
    lines, 
    fob: round(fob), 
    service, 
    total: round(round(fob) + service) 
  };
}
