export const solModes = {
  courier: { label: 'Courier aéreo', rate: 20, unit: 'kg real' },
  grupo: { label: 'Marítimo Importa en Grupo', rate: 5, unit: 'kg real' },
  lcl: { label: 'Marítimo LCL', rate: 400, unit: 'm³' },
  all: { label: 'All Inclusive fijo', rate: 2335, unit: 'servicio' }
};

export const solDefaults = {
  rates: Object.fromEntries(Object.entries(solModes).map(([mode, { rate }]) => [mode, rate])),
  insurance: 3, fee: 35, minKg: 45, maxKg: 400, maxCbm: 2
};

const round = value => Math.round(value * 100) / 100;
const valid = value => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

// Cálculo real de impuestos aduaneros basado en posición arancelaria (NCM)
function calculateRealTaxes(fob, freight, insurance, hscode) {
  if (!fob) return { ddiUSD: 0, statUSD: 0, totalTaxes: 0, lines: [] };

  const legalCifValue = fob + (freight || 0) + (insurance || 0);
  
  // DDI estimado según arancel o estándar de 16% si la NCM no está catalogada
  let ddiRate = 16; 
  const cleanHscode = String(hscode || '').replace(/\D/g, '');
  if (cleanHscode.startsWith('84') || cleanHscode.startsWith('85') || cleanHscode.startsWith('90')) {
    ddiRate = 14; // Bienes de capital / instrumental / tecnología
  } else if (cleanHscode.startsWith('61') || cleanHscode.startsWith('62') || cleanHscode.startsWith('64')) {
    ddiRate = 35; // Textil / Calzado
  }

  const ddiAmount = legalCifValue * (ddiRate / 100);
  const statAmount = legalCifValue * 0.03; // Tasa estadística fija 3%
  const taxBase = legalCifValue + ddiAmount + statAmount;

  const ivaAmount = taxBase * 0.21;
  const ivaAdicAmount = taxBase * 0.20;
  const gananciasAmount = taxBase * 0.06;
  const iibbAmount = taxBase * 0.025;

  const totalTaxes = ddiAmount + statAmount + ivaAmount + ivaAdicAmount + gananciasAmount + iibbAmount;

  return {
    totalTaxes: round(totalTaxes),
    details: [
      { label: 'Derechos de Importación (DDI)', detail: `${ddiRate}% sobre Base Aduana`, amount: round(ddiAmount) },
      { label: 'Tasa de Estadística', detail: '3.00% sobre Base Aduana', amount: round(statAmount) },
      { label: 'IVA General', detail: '21.00%', amount: round(ivaAmount) },
      { label: 'IVA Adicional', detail: '20.00%', amount: round(ivaAdicAmount) },
      { label: 'Percepción Ganancias', detail: '6.00%', amount: round(gananciasAmount) },
      { label: 'Percepción IIBB', detail: '2.50%', amount: round(iibbAmount) }
    ]
  };
}

export function calculateSol({ mode, settings, goods, weight, volume, hscode }) {
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

  if (fixed) {
    const { minKg, maxKg, maxCbm } = settings;
    if (kg > 0 && kg < 300 && cbm > 0 && cbm < 0.5) {
      return { error: 'Para cargas menores a 300 kg y 0.5 m³, la regla de operación indica cotizar Marítimo por m³ o Courier.' };
    }
  }

  const freightAmount = fixed ? activeRate : round(quantity * +activeRate);
  const insuranceAmount = round(fob * ((Number(settings.insurance) || 3) / 100));
  const taxesData = fixed ? { totalTaxes: 0, details: [] } : calculateRealTaxes(fob, freightAmount, insuranceAmount, hscode);
  const feeAmount = round(Number(settings.fee) || 35);

  const lines = fixed ? [
    { label: 'Servicio All Inclusive', detail: 'Flete, aduana y honorarios hasta Sarandí', amount: round(activeRate) }
  ] : [
    { label: 'Flete internacional', detail: `${quantity} ${solModes[mode].unit} × USD ${activeRate}`, amount: freightAmount },
    { label: 'Seguro internacional', detail: `${settings.insurance || 3}% del FOB`, amount: insuranceAmount },
    { label: 'Impuestos y Aduana', detail: 'DDI, Estadística, IVA, Ganancias e IIBB', amount: taxesData.totalTaxes },
    ...taxesData.details,
    { label: 'Honorarios DCAM', detail: 'Gestión integral', amount: feeAmount }
  ];

  const service = round(lines.reduce((total, line) => total + line.amount, 0));
  return { lines, fob: round(fob), service, total: round(round(fob) + (fixed ? service : freightAmount + insuranceAmount + taxesData.totalTaxes + feeAmount)) };
}
