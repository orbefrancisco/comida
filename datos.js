// Datos de la app Comida.
// ALIMENTOS: proteína (p) y kcal (k) por 100 g o 100 ml; u = gramos por unidad de medida; d = unidad por defecto.
// Valores aproximados (USDA / tablas latinoamericanas); los platos dominicanos son porciones típicas.
const ALIMENTOS = [
  // Huevos, carnes y pescados
  { id: 'huevo', n: 'Huevo', a: ['huevo', 'huevos', 'huevo frito', 'huevo hervido', 'huevos revueltos'], p: 12.6, k: 143, u: { ud: 50 }, d: 'ud' },
  { id: 'clara', n: 'Clara de huevo', a: ['clara', 'claras'], p: 11, k: 52, u: { ud: 33 }, d: 'ud' },
  { id: 'pechuga', n: 'Pechuga de pollo', a: ['pechuga', 'pechuga de pollo', 'pollo a la plancha', 'pollo plancha', 'pollo asado'], p: 31, k: 165, u: { porcion: 150, ud: 170 }, d: 'porcion' },
  { id: 'pollo_guisado', n: 'Pollo guisado', a: ['pollo guisado', 'pollo', 'pieza de pollo'], p: 25, k: 190, u: { porcion: 180, ud: 150 }, d: 'porcion' },
  { id: 'muslo', n: 'Muslo de pollo', a: ['muslo', 'muslos', 'pierna de pollo', 'cuadril'], p: 26, k: 210, u: { ud: 90 }, d: 'ud' },
  { id: 'picapollo', n: 'Pollo frito (picapollo)', a: ['picapollo', 'pica pollo', 'pollo frito'], p: 24, k: 280, u: { ud: 120, porcion: 240 }, d: 'ud' },
  { id: 'res', n: 'Carne de res guisada', a: ['res', 'carne', 'carne de res', 'res guisada', 'carne guisada'], p: 26, k: 230, u: { porcion: 150 }, d: 'porcion' },
  { id: 'molida', n: 'Carne molida', a: ['carne molida', 'molida', 'picadillo'], p: 26, k: 250, u: { porcion: 120, taza: 140 }, d: 'porcion' },
  { id: 'bistec', n: 'Bistec', a: ['bistec', 'biste', 'filete de res', 'churrasco'], p: 27, k: 220, u: { porcion: 150, ud: 150 }, d: 'porcion' },
  { id: 'chuleta', n: 'Chuleta de cerdo', a: ['chuleta', 'chuletas', 'cerdo', 'masa de cerdo'], p: 27, k: 240, u: { ud: 150, porcion: 150 }, d: 'ud' },
  { id: 'pernil', n: 'Pernil', a: ['pernil', 'puerco asado'], p: 28, k: 260, u: { porcion: 150 }, d: 'porcion' },
  { id: 'pescado', n: 'Pescado', a: ['pescado', 'filete de pescado', 'tilapia', 'mero', 'chillo', 'dorado', 'salmon', 'bacalao'], p: 22, k: 130, u: { porcion: 180 }, d: 'porcion' },
  { id: 'camaron', n: 'Camarones', a: ['camaron', 'camarones'], p: 24, k: 100, u: { porcion: 120, taza: 145 }, d: 'porcion' },
  { id: 'atun', n: 'Atún en lata', a: ['atun', 'lata de atun'], p: 26, k: 120, u: { ud: 120, lata: 120 }, d: 'lata' },
  { id: 'sardina', n: 'Sardinas en lata', a: ['sardina', 'sardinas'], p: 25, k: 210, u: { ud: 90, lata: 90 }, d: 'lata' },
  { id: 'salami', n: 'Salami', a: ['salami', 'salchichon'], p: 12, k: 300, u: { rebanada: 25, porcion: 70 }, d: 'rebanada' },
  { id: 'jamon', n: 'Jamón', a: ['jamon', 'jamon de pavo'], p: 17, k: 145, u: { rebanada: 20 }, d: 'rebanada' },
  { id: 'longaniza', n: 'Longaniza', a: ['longaniza', 'chorizo'], p: 14, k: 300, u: { porcion: 80 }, d: 'porcion' },
  { id: 'salchicha', n: 'Salchicha', a: ['salchicha', 'salchichas', 'hot dog'], p: 11, k: 290, u: { ud: 45 }, d: 'ud' },
  // Lácteos y suplementos
  { id: 'queso_freir', n: 'Queso de freír', a: ['queso frito', 'queso de freir', 'queso blanco'], p: 22, k: 330, u: { rebanada: 30, porcion: 60 }, d: 'rebanada' },
  { id: 'queso', n: 'Queso amarillo', a: ['queso', 'queso amarillo', 'cheddar', 'queso cheddar', 'queso de hoja'], p: 25, k: 400, u: { rebanada: 20 }, d: 'rebanada' },
  { id: 'queso_crema', n: 'Queso crema', a: ['queso crema'], p: 6, k: 340, u: { cda: 15 }, d: 'cda' },
  { id: 'leche', n: 'Leche', a: ['leche', 'leche entera', 'leche descremada'], p: 3.3, k: 61, u: { taza: 245, vaso: 250 }, d: 'vaso' },
  { id: 'yogur', n: 'Yogur', a: ['yogur', 'yogurt', 'yogur natural'], p: 3.5, k: 61, u: { ud: 170, taza: 245 }, d: 'ud' },
  { id: 'griego', n: 'Yogur griego', a: ['yogur griego', 'yogurt griego', 'griego'], p: 10, k: 60, u: { ud: 170, taza: 245 }, d: 'ud' },
  { id: 'whey', n: 'Proteína en polvo', a: ['proteina', 'proteina en polvo', 'whey', 'batida de proteina', 'batido de proteina', 'scoop'], p: 78, k: 380, u: { scoop: 30 }, d: 'scoop' },
  // Granos, víveres y harinas
  { id: 'arroz', n: 'Arroz blanco', a: ['arroz', 'arroz blanco', 'locrio blanco'], p: 2.7, k: 130, u: { taza: 160, porcion: 200, cucharon: 120 }, d: 'taza' },
  { id: 'moro', n: 'Moro de habichuelas', a: ['moro', 'moro de habichuelas', 'arroz con habichuelas'], p: 5, k: 170, u: { taza: 180, porcion: 220 }, d: 'taza' },
  { id: 'moro_guandules', n: 'Moro de guandules', a: ['moro de guandules', 'arroz con guandules'], p: 5, k: 165, u: { taza: 180, porcion: 220 }, d: 'taza' },
  { id: 'locrio', n: 'Locrio de pollo', a: ['locrio', 'locrio de pollo', 'arroz con pollo'], p: 9, k: 180, u: { porcion: 300, taza: 200 }, d: 'porcion' },
  { id: 'habichuelas', n: 'Habichuelas guisadas', a: ['habichuelas', 'habichuela', 'habichuelas guisadas', 'frijoles', 'caraotas'], p: 6, k: 110, u: { taza: 250, cucharon: 180, porcion: 180 }, d: 'cucharon' },
  { id: 'guandules', n: 'Guandules guisados', a: ['guandules', 'gandules'], p: 6, k: 120, u: { taza: 250, cucharon: 180 }, d: 'cucharon' },
  { id: 'lentejas', n: 'Lentejas', a: ['lentejas', 'lenteja'], p: 9, k: 116, u: { taza: 200, cucharon: 180 }, d: 'taza' },
  { id: 'garbanzos', n: 'Garbanzos', a: ['garbanzos', 'garbanzo'], p: 9, k: 164, u: { taza: 165 }, d: 'taza' },
  { id: 'espagueti', n: 'Espagueti', a: ['espagueti', 'espaguetis', 'pasta', 'macarrones', 'coditos'], p: 5.8, k: 158, u: { taza: 140, porcion: 220 }, d: 'porcion' },
  { id: 'pan', n: 'Pan de agua', a: ['pan', 'pan de agua', 'pan sobao'], p: 9, k: 270, u: { ud: 60 }, d: 'ud' },
  { id: 'pan_molde', n: 'Pan de molde', a: ['pan de molde', 'pan integral', 'tostada', 'tostadas'], p: 9, k: 260, u: { rebanada: 30 }, d: 'rebanada' },
  { id: 'casabe', n: 'Casabe', a: ['casabe', 'cazabe'], p: 1.5, k: 360, u: { ud: 30 }, d: 'ud' },
  { id: 'avena', n: 'Avena (cruda)', a: ['avena'], p: 13, k: 380, u: { taza: 80, cda: 10 }, d: 'taza' },
  { id: 'cereal', n: 'Cereal', a: ['cereal', 'corn flakes', 'granola'], p: 7, k: 380, u: { taza: 30 }, d: 'taza' },
  { id: 'mangu', n: 'Mangú', a: ['mangu', 'pure de platano'], p: 1.3, k: 150, u: { taza: 200, porcion: 250 }, d: 'porcion' },
  { id: 'tostones', n: 'Tostones', a: ['tostones', 'toston', 'fritos verdes', 'patacones'], p: 1.5, k: 310, u: { ud: 25 }, d: 'ud' },
  { id: 'maduro', n: 'Plátano maduro frito', a: ['maduro', 'maduros', 'fritos maduros', 'platano maduro'], p: 1.5, k: 260, u: { ud: 30 }, d: 'ud' },
  { id: 'platano', n: 'Plátano hervido', a: ['platano', 'platano hervido', 'platano verde'], p: 1.3, k: 120, u: { ud: 180 }, d: 'ud' },
  { id: 'yuca', n: 'Yuca hervida', a: ['yuca', 'yuca hervida'], p: 1.4, k: 160, u: { porcion: 200, taza: 140 }, d: 'porcion' },
  { id: 'batata', n: 'Batata', a: ['batata', 'camote', 'boniato'], p: 1.6, k: 86, u: { ud: 200, porcion: 200 }, d: 'ud' },
  { id: 'guineitos', n: 'Guineítos hervidos', a: ['guineitos', 'guineito', 'guineo verde'], p: 1.1, k: 89, u: { ud: 100 }, d: 'ud' },
  { id: 'papa', n: 'Papa', a: ['papa', 'papas', 'pure de papa'], p: 2, k: 87, u: { ud: 170, taza: 210 }, d: 'ud' },
  { id: 'papas_fritas', n: 'Papas fritas', a: ['papas fritas', 'papitas'], p: 3.4, k: 310, u: { porcion: 120 }, d: 'porcion' },
  // Frutas, verduras y otros
  { id: 'aguacate', n: 'Aguacate', a: ['aguacate', 'palta'], p: 2, k: 160, u: { ud: 300, rebanada: 40 }, d: 'rebanada' },
  { id: 'ensalada', n: 'Ensalada verde', a: ['ensalada', 'ensalada verde', 'lechuga', 'tomate', 'vegetales'], p: 1.2, k: 20, u: { taza: 60, porcion: 100 }, d: 'porcion' },
  { id: 'guineo', n: 'Guineo maduro', a: ['guineo', 'guineos', 'banana', 'banano'], p: 1.1, k: 89, u: { ud: 120 }, d: 'ud' },
  { id: 'manzana', n: 'Manzana', a: ['manzana'], p: 0.3, k: 52, u: { ud: 180 }, d: 'ud' },
  { id: 'mango', n: 'Mango', a: ['mango'], p: 0.8, k: 60, u: { ud: 300 }, d: 'ud' },
  { id: 'fruta', n: 'Fruta (piña, lechosa, melón…)', a: ['fruta', 'pina', 'lechosa', 'papaya', 'melon', 'sandia', 'naranja', 'chinola'], p: 0.6, k: 45, u: { taza: 160, ud: 150 }, d: 'taza' },
  { id: 'jugo', n: 'Jugo natural', a: ['jugo', 'jugo de naranja', 'jugo natural', 'morir sonando'], p: 0.7, k: 45, u: { vaso: 250 }, d: 'vaso' },
  { id: 'mani', n: 'Maní', a: ['mani', 'cacahuate', 'cacahuetes'], p: 26, k: 570, u: { porcion: 30, cda: 9 }, d: 'porcion' },
  { id: 'mantequilla_mani', n: 'Mantequilla de maní', a: ['mantequilla de mani', 'crema de mani'], p: 25, k: 590, u: { cda: 16 }, d: 'cda' },
  { id: 'almendras', n: 'Almendras o nueces', a: ['almendras', 'nueces', 'frutos secos'], p: 21, k: 580, u: { porcion: 30 }, d: 'porcion' },
  { id: 'cafe_leche', n: 'Café con leche', a: ['cafe con leche', 'cafe'], p: 1.5, k: 40, u: { taza: 240 }, d: 'taza' },
  { id: 'refresco', n: 'Refresco', a: ['refresco', 'soda', 'coca cola', 'malta', 'malta morena'], p: 0, k: 42, u: { ud: 355, vaso: 250 }, d: 'ud' },
  // Platos dominicanos y comida de la calle (porción típica)
  { id: 'bandera', n: 'La bandera (arroz, habichuelas y carne)', a: ['la bandera', 'bandera', 'bandera dominicana', 'plato del dia', 'comida del dia'], p: 7.5, k: 150, u: { porcion: 550 }, d: 'porcion' },
  { id: 'tres_golpes', n: 'Mangú con los tres golpes', a: ['tres golpes', 'mangu con los tres golpes', 'los tres golpes'], p: 6.8, k: 230, u: { porcion: 410 }, d: 'porcion' },
  { id: 'sancocho', n: 'Sancocho', a: ['sancocho', 'sancocho de siete carnes'], p: 6, k: 110, u: { porcion: 450 }, d: 'porcion' },
  { id: 'sopa', n: 'Sopa de pollo', a: ['sopa', 'sopa de pollo', 'caldo'], p: 4, k: 60, u: { porcion: 400 }, d: 'porcion' },
  { id: 'crema_auyama', n: 'Crema de auyama', a: ['crema de auyama', 'crema', 'auyama'], p: 1.5, k: 60, u: { porcion: 350 }, d: 'porcion' },
  { id: 'empanada', n: 'Empanada o pastelito', a: ['empanada', 'empanadas', 'pastelito', 'pastelitos', 'yanikeque'], p: 7, k: 300, u: { ud: 90 }, d: 'ud' },
  { id: 'quipe', n: 'Quipe', a: ['quipe', 'quipes', 'kipe'], p: 9, k: 260, u: { ud: 80 }, d: 'ud' },
  { id: 'chimi', n: 'Chimi', a: ['chimi', 'chimichurri', 'hamburguesa dominicana'], p: 11, k: 240, u: { ud: 300 }, d: 'ud' },
  { id: 'hamburguesa', n: 'Hamburguesa', a: ['hamburguesa'], p: 13, k: 250, u: { ud: 220 }, d: 'ud' },
  { id: 'pizza', n: 'Pizza', a: ['pizza'], p: 11, k: 270, u: { rebanada: 110 }, d: 'rebanada' },
  { id: 'sandwich', n: 'Sándwich de jamón y queso', a: ['sandwich', 'sandwiches', 'emparedado', 'tostada de jamon y queso'], p: 12, k: 260, u: { ud: 160 }, d: 'ud' },
  { id: 'mofongo', n: 'Mofongo', a: ['mofongo'], p: 4, k: 220, u: { porcion: 350 }, d: 'porcion' }
];

// Unidades que se pueden escribir y cómo se llaman al mostrarlas.
const UNIDADES = {
  g: { s: 'g', pl: 'g', alias: ['g', 'gr', 'grs', 'gramo', 'gramos'] },
  ud: { s: 'unidad', pl: 'unidades', alias: ['ud', 'uds', 'unidad', 'unidades', 'pieza', 'piezas', 'pedazo', 'pedazos'] },
  porcion: { s: 'porción', pl: 'porciones', alias: ['porcion', 'porciones', 'plato', 'platos', 'racion', 'puñado', 'punado'] },
  taza: { s: 'taza', pl: 'tazas', alias: ['taza', 'tazas'] },
  cucharon: { s: 'cucharón', pl: 'cucharones', alias: ['cucharon', 'cucharones'] },
  cda: { s: 'cda', pl: 'cdas', alias: ['cda', 'cdas', 'cucharada', 'cucharadas'] },
  rebanada: { s: 'rebanada', pl: 'rebanadas', alias: ['rebanada', 'rebanadas', 'lonja', 'lonjas', 'lasca', 'lascas', 'tajada', 'tajadas', 'slice'] },
  scoop: { s: 'scoop', pl: 'scoops', alias: ['scoop', 'scoops', 'medida', 'medidas', 'servicio'] },
  vaso: { s: 'vaso', pl: 'vasos', alias: ['vaso', 'vasos'] },
  lata: { s: 'lata', pl: 'latas', alias: ['lata', 'latas'] }
};
const PESOS = { kg: 1000, onza: 28.35, onzas: 28.35, oz: 28.35, lb: 453.6, lbs: 453.6, libra: 453.6, libras: 453.6 };

// Ingredientes y recetas del "Plan de comidas semanal" (cantidades por persona).
// p = proteína por unidad de la receta (por g, por ml o por unidad); k = kcal igual.
const ING = {
  platanoV: ['Plátano verde', 'Víveres', 'ud', 2.6, 240], guineo: ['Guineo maduro', 'Frutas y verduras', 'ud', 1.3, 105],
  yuca: ['Yuca', 'Víveres', 'g', .014, 1.6], name: ['Ñame', 'Víveres', 'g', .015, 1.18], batata: ['Batata', 'Víveres', 'g', .016, .86],
  auyama: ['Auyama', 'Víveres', 'g', .01, .26], mazorca: ['Mazorca de maíz', 'Víveres', 'ud', 3.3, 90],
  salami: ['Salami', 'Carnes', 'g', .12, 3], pollo: ['Pollo (piezas)', 'Carnes', 'g', .17, 2.15], pechuga: ['Pechuga de pollo', 'Carnes', 'g', .23, 1.2],
  res: ['Carne de res', 'Carnes', 'g', .2, 2], cerdo: ['Cerdo', 'Carnes', 'g', .19, 2.4], pescado: ['Pescado (filete o entero)', 'Carnes', 'g', .2, 1.1],
  longaniza: ['Longaniza', 'Carnes', 'g', .14, 3],
  huevo: ['Huevos', 'Lácteos y huevos', 'ud', 6.3, 72], queso: ['Queso de freír', 'Lácteos y huevos', 'g', .22, 3.3], leche: ['Leche', 'Lácteos y huevos', 'ml', .033, .61],
  cebollaR: ['Cebolla roja', 'Frutas y verduras', 'ud', 1.2, 44], tomate: ['Tomate', 'Frutas y verduras', 'ud', 1.1, 22], lechuga: ['Lechuga', 'Frutas y verduras', 'ud', 7, 75],
  aguacate: ['Aguacate', 'Frutas y verduras', 'ud', 6, 480], aji: ['Ají cubanela', 'Frutas y verduras', 'ud', .9, 20], repollo: ['Repollo', 'Frutas y verduras', 'ud', 11.7, 225],
  zanahoria: ['Zanahoria', 'Frutas y verduras', 'ud', .6, 25],
  arroz: ['Arroz', 'Granos y despensa', 'g', .07, 3.6], habichuelas: ['Habichuelas rojas', 'Granos y despensa', 'g', .22, 3.3], guandules: ['Guandules', 'Granos y despensa', 'g', .072, 1.36],
  avena: ['Avena', 'Granos y despensa', 'g', .13, 3.8], pan: ['Pan de agua', 'Granos y despensa', 'ud', 5.4, 160], coco: ['Leche de coco', 'Granos y despensa', 'ml', .023, 2],
  espagueti: ['Espagueti', 'Granos y despensa', 'g', .13, 3.7], atun: ['Atún en lata', 'Granos y despensa', 'ud', 30, 140], aceitunas: ['Aceitunas', 'Granos y despensa', 'g', .008, 1.15]
};
const RECETAS = {
  desayuno: [
    ['Mangú con los tres golpes', { platanoV: 1.5, salami: 60, queso: 50, huevo: 1, cebollaR: .25 }],
    ['Avena con guineo', { avena: 50, leche: 250, guineo: 1 }],
    ['Huevos revueltos con pan y tomate', { huevo: 2, pan: 1, tomate: .5 }],
    ['Yuca hervida con huevo y cebolla', { yuca: 200, huevo: 2, cebollaR: .25 }],
    ['Batata con queso frito', { batata: 200, queso: 60 }],
    ['Guineítos con salami', { guineo: 2, salami: 70, cebollaR: .25 }]
  ],
  almuerzo: [
    ['La bandera (arroz, habichuelas, pollo guisado)', { arroz: 90, habichuelas: 60, pollo: 220, lechuga: .2, tomate: .5 }],
    ['Moro de guandules con pollo', { arroz: 90, guandules: 70, pollo: 220, aji: .25 }],
    ['Sancocho', { pollo: 150, cerdo: 80, longaniza: 40, yuca: 120, name: 100, platanoV: .5, mazorca: .5, auyama: 80 }],
    ['Pescado con coco y arroz blanco', { pescado: 220, coco: 100, arroz: 90, aji: .5, tomate: .5 }],
    ['Locrio de pollo', { arroz: 100, pollo: 200, aji: .5, aceitunas: 15 }],
    ['Res guisada, arroz y habichuelas', { res: 200, arroz: 90, habichuelas: 60, aji: .25 }],
    ['Espagueti con salami', { espagueti: 110, salami: 80, cebollaR: .25, aji: .25 }],
    ['Chuleta de cerdo con moro y ensalada de repollo', { cerdo: 220, arroz: 90, habichuelas: 50, repollo: .15, zanahoria: .5 }]
  ],
  cena: [
    ['Pechuga a la plancha con ensalada y aguacate', { pechuga: 180, lechuga: .25, tomate: 1, aguacate: .5 }],
    ['Tostones con queso y aguacate', { platanoV: 1, queso: 80, aguacate: .5 }],
    ['Crema de auyama con pan', { auyama: 300, cebollaR: .5, leche: 100, pan: 1 }],
    ['Batata asada con huevos', { batata: 250, huevo: 2 }],
    ['Ensalada de atún con aguacate', { atun: 1, aguacate: .5, tomate: 1, lechuga: .25, cebollaR: .25 }],
    ['Sopa de pollo con víveres', { pollo: 150, yuca: 100, auyama: 80, zanahoria: .5, mazorca: .5 }],
    ['Sándwich de pollo desmenuzado', { pechuga: 130, pan: 1, tomate: .5, lechuga: .15 }]
  ]
};
const FUERA = 'Comer fuera / sobras';
const PLAN_INICIAL = [
  ['Mangú con los tres golpes', 'La bandera (arroz, habichuelas, pollo guisado)', 'Pechuga a la plancha con ensalada y aguacate'],
  ['Avena con guineo', 'Pescado con coco y arroz blanco', 'Tostones con queso y aguacate'],
  ['Huevos revueltos con pan y tomate', 'Res guisada, arroz y habichuelas', 'Crema de auyama con pan'],
  ['Avena con guineo', 'Moro de guandules con pollo', 'Ensalada de atún con aguacate'],
  ['Yuca hervida con huevo y cebolla', 'Locrio de pollo', FUERA],
  ['Batata con queso frito', FUERA, 'Sándwich de pollo desmenuzado'],
  ['Mangú con los tres golpes', 'Sancocho', 'Sopa de pollo con víveres']
];

// Precios APROXIMADOS en pesos dominicanos (RD$), solo para empezar: estimados a mano de supermercado/colmado,
// NO son precios oficiales. Cada quien los cambia en Plan → Precios y se guardan en S.precios.
// Ingredientes del plan: por libra (los que se miden en g), por litro (ml) o por unidad (ud).
const PRECIO_ING = {
  platanoV: 30, guineo: 10, yuca: 30, name: 45, batata: 30, auyama: 30, mazorca: 35,
  salami: 180, pollo: 90, pechuga: 160, res: 280, cerdo: 180, pescado: 250, longaniza: 200,
  huevo: 9, queso: 240, leche: 85,
  cebollaR: 15, tomate: 15, lechuga: 60, aguacate: 60, aji: 10, repollo: 80, zanahoria: 10,
  arroz: 40, habichuelas: 100, guandules: 65, avena: 80, pan: 8, coco: 225, espagueti: 55, atun: 80, aceitunas: 250
};
// Alimentos sueltos: por la unidad con que la app los cuenta por defecto (d), p. ej. huevo por unidad, atún por lata,
// pechuga por porción de 150 g ya cocida; platos de la calle o del comedor, por plato.
const PRECIO_ALI = {
  huevo: 9, clara: 9, pechuga: 70, pollo_guisado: 60, muslo: 25, picapollo: 90, res: 90, molida: 60, bistec: 100,
  chuleta: 60, pernil: 90, pescado: 100, camaron: 120, atun: 80, sardina: 60, salami: 10, jamon: 10, longaniza: 35,
  salchicha: 15, queso_freir: 16, queso: 10, queso_crema: 8, leche: 21, yogur: 45, griego: 70, whey: 65,
  arroz: 5, moro: 12, moro_guandules: 12, locrio: 70, habichuelas: 15, guandules: 15, lentejas: 15, garbanzos: 25,
  espagueti: 20, pan: 8, pan_molde: 6, casabe: 10, avena: 14, cereal: 15, mangu: 50, tostones: 8, maduro: 8,
  platano: 30, yuca: 15, batata: 15, guineitos: 8, papa: 15, papas_fritas: 120, aguacate: 10, ensalada: 20,
  guineo: 10, manzana: 35, mango: 40, fruta: 25, jugo: 50, mani: 15, mantequilla_mani: 10, almendras: 40,
  cafe_leche: 15, refresco: 45, bandera: 250, tres_golpes: 200, sancocho: 250, sopa: 150, crema_auyama: 100,
  empanada: 50, quipe: 40, chimi: 200, hamburguesa: 300, pizza: 150, sandwich: 150, mofongo: 300
};
