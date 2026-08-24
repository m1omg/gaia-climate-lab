"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PlanetRenderer from "./planet-renderer";

type Config = {
  flux: number;
  mass: number;
  water: number;
  geology: number;
  n2: number;
  co2: number;
  ch4: number;
  h2: number;
  land: number;
  rotation: number;
  albedo: number;
  haze: number;
};

type Sample = { year: number; temp: number; water: number; co2: number };

type Simulation = {
  year: number;
  oceanReserve: number;
  steamReserve: number;
  escapedWater: number;
  co2: number;
  temp: number;
  history: Sample[];
};

type Locale = "en" | "sk";
type EditMode = "live" | "reset";

type ClimateState =
  | "Habitable"
  | "Waterworld"
  | "Icehouse"
  | "Snowball"
  | "Desert planet"
  | "Mars-like"
  | "Anti-greenhouse"
  | "Hothouse"
  | "Moist greenhouse"
  | "Wet runaway"
  | "Steam atmosphere"
  | "Supercritical H₂O"
  | "Magma ocean"
  | "Dry runaway"
  | "Venus-like";

type Climate = {
  state: ClimateState;
  stateEmoji: string;
  stateTone: string;
  stateSummary: string;
  equilibriumTemp: number;
  preRunawayTemp: number;
  surfaceTemp: number;
  incomingFlux: number;
  netHeating: number;
  albedo: number;
  pressure: number;
  steamPressure: number;
  gravity: number;
  waterCoverage: number;
  iceCoverage: number;
  cloudCover: number;
  waterVapor: number;
  greenhouseIndex: number;
  iceFeedback: number;
  cloudFeedback: number;
  hazeFeedback: number;
  runawayScore: number;
  moistScore: number;
  criticalFlux: number;
  liquidWater: number;
  retention: number;
  waterLossRate: number;
  waterLossMode: string;
  phaseRate: number;
  phaseMode: string;
  waterPhase: string;
  waterPhaseDetail: string;
  boilingPoint: number;
  boilingMargin: number;
  carbonOutgassingRate: number;
  carbonWeatheringRate: number;
  carbonNetRate: number;
  carbonCycleMode: string;
  carbonCycleHealth: number;
  absorbedFlux: number;
  dryOpticalDepth: number;
  dominantOpacity: string;
  modelValidity: "Calibrated" | "Extrapolated" | "High-temperature limit" | "Pressure limit";
  runawayActive: boolean;
  transitionLabel: string;
};

const STEFAN_BOLTZMANN = 5.670374419e-8;
const EARTH_AREA = 5.1006e14;
const SECONDS_PER_YEAR = 31_557_600;
// Order-of-magnitude enthalpy needed to heat an Earth ocean into a steam atmosphere.
// This is deliberately an energy budget, not a fitted gameplay speed.
const OCEAN_VAPORIZATION_ENERGY = 3.0e27;
const RUNAWAY_OLR_LIMIT = 282;
const MAGMA_OCEAN_TEMPERATURE = 1_500;
// This is a model-domain guard, not a physical temperature ceiling. Above it,
// silicate vapor, dissociation, ionization, and interior cooling need a coupled
// chemistry/interior model that this browser-scale climate surrogate lacks.
const HIGH_TEMPERATURE_MODEL_CEILING = 3_200;
const MOIST_ESCAPE_RATE = 1.0e-8;
const WATER_TRIPLE_TEMPERATURE = 273.16;
const WATER_TRIPLE_PRESSURE = 0.00611657;
const WATER_CRITICAL_TEMPERATURE = 647.096;
const WATER_CRITICAL_PRESSURE = 220.64;
// Six Tmol C yr⁻¹ is about 47 bar of CO₂ per Gyr on an Earth-size planet.
const EARTH_CO2_OUTGASSING_RATE = 47e-9;
const WEATHERING_CO2_REFERENCE = 0.0004;
const WEATHERING_TEMP_REFERENCE = 288;
const WEATHERING_TEMP_EFOLD = 25;
const WEATHERING_CO2_EXPONENT = 0.3;
const MAX_DIRECT_INPUT = 1_000_000;
const MAX_ATMOSPHERIC_CO2 = 1_000_000;

const DEFAULTS: Config = {
  flux: 100,
  mass: 1,
  water: 1,
  geology: 100,
  n2: 1,
  co2: 0.0004,
  ch4: 0.0002,
  h2: 0,
  land: 35,
  rotation: 1,
  albedo: 0.22,
  haze: 0.02,
};

const PRESETS: Array<{
  id: string;
  label: string;
  icon: string;
  description: string;
  config: Config;
}> = [
  {
    id: "earth",
    label: "Earthlike",
    icon: "◒",
    description: "A temperate ocean-and-continent world.",
    config: DEFAULTS,
  },
  {
    id: "snowball",
    label: "Snowball",
    icon: "✦",
    description: "Ice–albedo feedback takes the wheel.",
    config: {
      ...DEFAULTS,
      flux: 82,
      albedo: 0.38,
      land: 42,
      co2: 0.0002,
      water: 1.1,
      haze: 0,
    },
  },
  {
    id: "desert",
    label: "Land planet",
    icon: "⌁",
    description: "Dry, bright, and harder to push into a moist greenhouse.",
    config: {
      ...DEFAULTS,
      flux: 108,
      water: 0.09,
      land: 84,
      albedo: 0.3,
      n2: 0.75,
      co2: 0.02,
      rotation: 2,
    },
  },
  {
    id: "waterworld",
    label: "Waterworld",
    icon: "≈",
    description: "A deep global ocean with little exposed land.",
    config: {
      ...DEFAULTS,
      flux: 103,
      water: 3.2,
      land: 5,
      albedo: 0.12,
      rotation: 2,
      n2: 1.2,
    },
  },
  {
    id: "slow",
    label: "Slow rotator",
    icon: "◎",
    description: "Long days build a reflective substellar cloud deck.",
    config: {
      ...DEFAULTS,
      flux: 122,
      rotation: 80,
      land: 25,
      water: 1.2,
      albedo: 0.19,
    },
  },
  {
    id: "runaway",
    label: "Runaway test",
    icon: "⚠",
    description: "Cross the moist threshold, then watch water leave the surface.",
    config: {
      ...DEFAULTS,
      flux: 138,
      mass: 0.9,
      water: 1.6,
      land: 18,
      albedo: 0.18,
      n2: 1,
      co2: 0.65,
      ch4: 0.35,
      h2: 3,
      rotation: 1.3,
      haze: 0.02,
    },
  },
  {
    id: "mars",
    label: "Mars today",
    icon: "●",
    description: "A cold, thin-atmosphere benchmark using present Mars forcing.",
    config: {
      ...DEFAULTS,
      flux: 44.4,
      mass: 0.107,
      water: 0.005,
      geology: 0,
      land: 100,
      rotation: 1.027,
      albedo: 0.25,
      n2: 0.001,
      co2: 0.006,
      ch4: 0,
      h2: 0,
      haze: 0,
    },
  },
  {
    id: "venus",
    label: "Venus today",
    icon: "◉",
    description: "A high-pressure CO₂ benchmark using present Venus forcing.",
    config: {
      ...DEFAULTS,
      flux: 193,
      mass: 0.815,
      water: 0,
      geology: 100,
      land: 100,
      rotation: 243,
      albedo: 0.675,
      n2: 3.5,
      co2: 89.6,
      ch4: 0,
      h2: 0,
      haze: 0,
    },
  },
];

const STATE_META: Record<ClimateState, { emoji: string; tone: string; summary: string }> = {
  Habitable: { emoji: "◒", tone: "mint", summary: "Liquid water and a temperate surface can coexist." },
  Waterworld: { emoji: "≈", tone: "cyan", summary: "A deep ocean dominates the climate and stores a lot of heat." },
  Icehouse: { emoji: "✦", tone: "ice", summary: "Ice is widespread, but dark water or low latitudes can remain open." },
  Snowball: { emoji: "❄", tone: "ice", summary: "Bright ice reflects enough starlight to reinforce global freezing." },
  "Desert planet": { emoji: "⌁", tone: "sand", summary: "Sparse surface water keeps the atmosphere relatively dry." },
  "Mars-like": { emoji: "●", tone: "rust", summary: "Low pressure and weak heat retention leave a cold, exposed surface." },
  "Anti-greenhouse": { emoji: "◇", tone: "violet", summary: "A high haze layer blocks part of the incoming starlight." },
  Hothouse: { emoji: "☼", tone: "amber", summary: "A stable but very warm climate, short of the water-vapor tipping point." },
  "Moist greenhouse": { emoji: "∿", tone: "orange", summary: "The upper atmosphere is becoming wet; water loss can accelerate over time." },
  "Wet runaway": { emoji: "↗", tone: "hot", summary: "A steamy atmosphere is warming faster than the planet can radiate away heat." },
  "Steam atmosphere": { emoji: "≋", tone: "hot", summary: "The ocean is airborne; a massive H₂O atmosphere remains while hydrogen escapes to space." },
  "Supercritical H₂O": { emoji: "◌", tone: "cyan", summary: "Water is above its critical temperature and pressure, so no liquid–vapor boundary remains." },
  "Magma ocean": { emoji: "◍", tone: "magma", summary: "The modeled surface is hot enough for widespread silicate melt; atmospheric chemistry is now an extrapolation." },
  "Dry runaway": { emoji: "◈", tone: "rust", summary: "The ocean and steam have escaped; the remaining gases now set the dry surface temperature." },
  "Venus-like": { emoji: "◉", tone: "crimson", summary: "A high-pressure CO₂ atmosphere produces a Venus-calibrated surface climate." },
};

const VISUAL_REGIME: Record<ClimateState, string> = {
  Habitable: "Oceans · continents · weather",
  Waterworld: "Deep global ocean",
  Icehouse: "Open water · expanding ice",
  Snowball: "Global ice shell",
  "Desert planet": "Dry mineral surface",
  "Mars-like": "Thin air · oxidized dust",
  "Anti-greenhouse": "Opaque high haze",
  Hothouse: "Hot surface · humid clouds",
  "Moist greenhouse": "Wet upper atmosphere",
  "Wet runaway": "Evaporating ocean · steam",
  "Steam atmosphere": "Opaque H₂O cloud deck",
  "Supercritical H₂O": "Dense supercritical H₂O envelope",
  "Magma ocean": "Molten silicates · hot atmosphere",
  "Dry runaway": "Desiccated mineral surface",
  "Venus-like": "Dense sulfurous cloud deck",
};

const PRESET_COPY: Record<Locale, Record<string, { label: string; description: string }>> = {
  en: Object.fromEntries(PRESETS.map((preset) => [preset.id, { label: preset.label, description: preset.description }])),
  sk: {
    earth: { label: "Podobná Zemi", description: "Mierny svet s oceánmi a kontinentmi." },
    snowball: { label: "Snehová guľa", description: "Klímu ovládne spätná väzba medzi ľadom a albedom." },
    desert: { label: "Suchá planéta", description: "Suchý, svetlý svet odolnejší voči vlhkému skleníku." },
    waterworld: { label: "Oceánsky svet", description: "Hlboký globálny oceán s malým podielom súše." },
    slow: { label: "Pomalá rotácia", description: "Dlhé dni vytvárajú odrazivú oblačnosť na osvetlenej strane." },
    runaway: { label: "Test skleníka", description: "Prekročte vlhký prah a sledujte úbytok vody z povrchu." },
    mars: { label: "Dnešný Mars", description: "Chladný svet s riedkou atmosférou a dnešným žiarením Marsu." },
    venus: { label: "Dnešná Venuša", description: "Kontrolný svet s hustou atmosférou CO₂ a dnešným žiarením Venuše." },
  },
};

const STATE_LABELS: Record<Locale, Record<ClimateState, string>> = {
  en: {
    Habitable: "Habitable",
    Waterworld: "Waterworld",
    Icehouse: "Icehouse",
    Snowball: "Snowball",
    "Desert planet": "Desert planet",
    "Mars-like": "Mars-like",
    "Anti-greenhouse": "Anti-greenhouse",
    Hothouse: "Hothouse",
    "Moist greenhouse": "Moist greenhouse",
    "Wet runaway": "Wet runaway",
    "Steam atmosphere": "Steam atmosphere",
    "Supercritical H₂O": "Supercritical H₂O",
    "Magma ocean": "Magma ocean",
    "Dry runaway": "Dry runaway",
    "Venus-like": "Venus-like",
  },
  sk: {
    Habitable: "Obývateľná",
    Waterworld: "Oceánsky svet",
    Icehouse: "Ľadový svet",
    Snowball: "Snehová guľa",
    "Desert planet": "Púštna planéta",
    "Mars-like": "Podobná Marsu",
    "Anti-greenhouse": "Antiskleníkový stav",
    Hothouse: "Horúci skleník",
    "Moist greenhouse": "Vlhký skleník",
    "Wet runaway": "Nekontrolovateľný vlhký skleník",
    "Steam atmosphere": "Parná atmosféra",
    "Supercritical H₂O": "Superkritická H₂O",
    "Magma ocean": "Magmatický oceán",
    "Dry runaway": "Vyschnutý skleník",
    "Venus-like": "Podobná Venuši",
  },
};

const STATE_SUMMARIES: Record<Locale, Record<ClimateState, string>> = {
  en: Object.fromEntries(Object.entries(STATE_META).map(([state, meta]) => [state, meta.summary])) as Record<ClimateState, string>,
  sk: {
    Habitable: "Kvapalná voda môže existovať spolu s miernou povrchovou teplotou.",
    Waterworld: "Klímu a tepelnú zotrvačnosť určuje hlboký globálny oceán.",
    Icehouse: "Ľad je rozšírený, no tmavšia voda alebo nízke zemepisné šírky zostávajú otvorené.",
    Snowball: "Svetlý ľad odráža toľko žiarenia, že udržiava planétu zamrznutú.",
    "Desert planet": "Malá zásoba povrchovej vody udržiava atmosféru pomerne suchú.",
    "Mars-like": "Nízky tlak a slabé zadržiavanie tepla ponechávajú povrch chladný a odkrytý.",
    "Anti-greenhouse": "Vysoká vrstva zákalu zachytáva časť prichádzajúceho svetla.",
    Hothouse: "Stabilná, ale veľmi teplá klíma tesne pred bodom zlomu vodnej pary.",
    "Moist greenhouse": "Horná atmosféra vlhne a únik vody sa môže časom zrýchliť.",
    "Wet runaway": "Oceán sa odparuje a planéta prijíma viac tepla, než dokáže vyžiariť.",
    "Steam atmosphere": "Oceán je v atmosfére; vodík z masívnej vrstvy H₂O uniká do vesmíru.",
    "Supercritical H₂O": "Voda prekročila kritickú teplotu aj tlak, preto už nemá rozhranie kvapalina–para.",
    "Magma ocean": "Povrch je dostatočne horúci na rozsiahle tavenie silikátov; atmosférická chémia je už len extrapolovaná.",
    "Dry runaway": "Voda unikla a teplotu suchého povrchu teraz určujú zostávajúce plyny.",
    "Venus-like": "Hustá atmosféra CO₂ vytvára povrchovú klímu podobnú Venuši.",
  },
};

const VISUAL_REGIME_SK: Record<ClimateState, string> = {
  Habitable: "Oceány · kontinenty · počasie",
  Waterworld: "Hlboký globálny oceán",
  Icehouse: "Otvorená voda · pribúdajúci ľad",
  Snowball: "Globálny ľadový obal",
  "Desert planet": "Suchý minerálny povrch",
  "Mars-like": "Riedka atmosféra · zoxidovaný prach",
  "Anti-greenhouse": "Nepriehľadný výškový zákal",
  Hothouse: "Horúci povrch · vlhká oblačnosť",
  "Moist greenhouse": "Vlhká horná atmosféra",
  "Wet runaway": "Odparujúci sa oceán · para",
  "Steam atmosphere": "Nepriehľadná oblačnosť H₂O",
  "Supercritical H₂O": "Hustý obal superkritickej H₂O",
  "Magma ocean": "Roztavené silikáty · horúca atmosféra",
  "Dry runaway": "Vyschnutý minerálny povrch",
  "Venus-like": "Hustá oblačnosť s kyselinou sírovou",
};

const UI = {
  en: {
    brandKicker: "EXOPLANETARY CLIMATE SIM",
    modelChip: "Coupled 0D climate–carbon model",
    fieldNotes: "Field notes",
    language: "Language",
    introEyebrow: "DESIGN A CLIMATE · WATCH IT EVOLVE",
    introLead: "Build a world.",
    introAccent: "Find its tipping points.",
    introCopy: "Tune the star, planet, surface water, atmosphere, and rotation. Then let the climate run on an accelerated geological clock.",
    liveField: "Live climate field",
    startingWorlds: "STARTING WORLDS",
    presetHint: "Pick a direction, then experiment.",
    worldBuilder: "WORLD BUILDER",
    setInputs: "Set the inputs",
    changeMode: "PARAMETER CHANGES",
    liveChanges: "Live",
    resetChanges: "Reset on edit",
    liveChangesHint: "Edits preserve the clock, temperature, carbon, and water reservoirs. Presets still start a new world.",
    resetChangesHint: "Every parameter edit starts the model at year zero with the displayed settings.",
    editExact: "Click to enter an exact value",
    exactValue: "Exact value",
    stellarForcing: "Stellar forcing",
    stellarFlux: "Stellar flux",
    stellarFluxHint: "100% = present Earth’s mean incoming flux",
    albedo: "Reflectivity / albedo",
    albedoHint: "Bright surfaces send more starlight back to space",
    haze: "High-altitude haze",
    hazeHint: "Absorbs light aloft; a Titan-like anti-greenhouse lever",
    planetaryBody: "Planetary body",
    mass: "Planetary mass",
    gravity: "surface gravity",
    retention: "retention index",
    geology: "Geological activity",
    geologyHint: "of the modern-Earth reference · volcanic input before weathering",
    water: "Planetary H₂O inventory",
    airborne: "airborne",
    escaped: "escaped",
    land: "Exposed land",
    landHint: "Changes surface albedo, water coverage, and heat capacity",
    rotation: "Rotation period",
    rotationSlow: "slow / lock territory",
    rotationHint: "Slow rotation can create a reflective dayside cloud shield",
    days: "days",
    gases: "Atmospheric mix",
    nitrogen: "Nitrogen / background air",
    nitrogenHint: "Surface partial pressure; high values broaden infrared absorption",
    carbon: "Atmospheric carbon dioxide",
    carbonHint: "Volcanism and weathering update this value on the geological clock",
    methane: "Methane",
    methaneHint: "Greenhouse forcing; high CH₄/CO₂ ratios can self-limit through organic haze",
    hydrogen: "Hydrogen",
    hydrogenHint: "Collision-induced warming and easier atmospheric escape",
    observatory: "PLANETARY OBSERVATORY",
    render: "Procedural 3D climate render",
    surfaceResponse: "Surface response",
    surfaceTemp: "Surface temperature",
    mean: "mean",
    pressure: "Atmospheric pressure",
    surfaceOcean: "Surface ocean",
    earthOceans: "× Earth ocean",
    oceanInputUnit: "oceans",
    liquidCover: "liquid cover",
    criticalEnvelope: "× Earth ocean in one supercritical envelope · no liquid cover",
    waterPhase: "H₂O phase",
    tempHistory: "Temperature history",
    waterLeft: "Planetary H₂O left",
    geologicalClock: "GEOLOGICAL CLOCK",
    running: "Simulation running",
    paused: "Simulation paused",
    pause: "Pause climate",
    run: "Run climate",
    reset: "Reset",
    speed: "Simulation speed",
    diagnostics: "FEEDBACK DIAGNOSTICS",
    drivers: "What is driving it?",
    greenhouse: "Greenhouse load",
    iceLock: "Ice–albedo lock",
    ice: "ice",
    cloudShield: "Cloud shield",
    cloud: "cloud",
    runaway: "Runaway pressure",
    carbonThermostat: "Carbon thermostat",
    runawayThreshold: "Approx. H₂O runaway threshold",
    noWaterLimit: "no H₂O limit",
    radiativeTarget: "Radiative-equilibrium target",
    dominantOpacity: "Dominant infrared opacity",
    modelValidity: "Model domain",
    phaseCheck: "H₂O phase check",
    carbonBalance: "Carbon-cycle balance",
    volcanic: "Volcanic",
    weathering: "Weathering",
    stateAtlas: "STATE ATLAS",
    regimes: "Climate regimes",
    atlasHint: "The same inputs can travel through several states over time.",
    ledger: "ATMOSPHERIC LEDGER",
    composition: "Composition",
    background: "background",
    evolving: "evolving",
    vapor: "vapor",
    modelNotes: "MODEL FIELD NOTES",
    hideNotes: "Hide research notes ↑",
    openNotes: "Open research notes ↓",
    phaseTitle: "Pressure-aware H₂O phases",
    phaseNote: "The surface reservoir is checked against the pressure-dependent water saturation curve instead of a fixed 373 K cutoff. Above the local boiling point it transfers into steam. At ≥647.096 K and ≥220.64 bar H₂O partial pressure, water is labelled supercritical; above the critical temperature but below the critical pressure it remains superheated steam. A moist greenhouse requires a retained, sub-boiling liquid ocean—an oceanless world cannot receive that label.",
    correctionTitle: "Runaway correction",
    correctionNote: "Ocean evaporation transfers H₂O into a separate steam reservoir; it does not delete water from the planet. Escape removes that steam over geological time. The water-vapour OLR ceiling is active only while H₂O remains. Once the steam is gone, the dry planet cools toward the radiative equilibrium produced by its actual N₂, CO₂, CH₄, H₂, albedo, and stellar flux—there is no inherited runaway temperature.",
    highTempTitle: "No gas has a fixed maximum temperature",
    highTempNote: "Surface temperature is now solved from absorbed stellar energy and a pressure-, composition-, and temperature-dependent infrared optical depth. CO₂, CH₄, H₂ collision pairs, and H₂O therefore have no intrinsic °C ceiling. A wet runaway follows the ~282 W/m² radiation plateau, then moves onto a post-runaway branch as shortwave and near-IR thermal windows reopen. Dense CO₂ remains tied to modern Venus, methane forcing is limited by photochemical haze, and H₂ warming scales with collision partners. At ≥1,500 K the surface is labelled a magma ocean; above 3,200 K or 1,000 bar the result is explicitly outside this 0D model’s calibrated domain rather than presented as a precise prediction.",
    carbonTitle: "Geological carbon cycle",
    carbonNote: "At 100% activity, volcanic input is 47 bar CO₂ per Gyr, equivalent to the 6 Tmol C/yr modern-Earth reference used by Lehmer et al. Weathering follows F/F₀ = (pCO₂/p₀)^0.3 exp[(T−288 K)/25 K], then scales with land, liquid water, ice, and fresh-rock supply. Continental weathering nearly collapses in a Snowball but a small seafloor sink remains; this reference hard Snowball stays ice-locked below 0.2 bar CO₂. All silicate weathering stops in steam, desiccated, or ≥355 K climates. CH₄ and H₂ remain prescribed because volcanic speciation requires mantle-redox and photochemical inputs this lab does not have.",
    anchors: "Research anchors",
    footerLead: "GAIA CLIMATE LAB · A PLAYABLE MAP OF FEEDBACKS",
    footerNote: "Coupled 0D climate–carbon reference model · not a GCM or geochemical reservoir model.",
  },
  sk: {
    brandKicker: "SIMULÁTOR KLÍMY EXOPLANÉT",
    modelChip: "Prepojený 0D model klímy a uhlíka",
    fieldNotes: "Poznámky k modelu",
    language: "Jazyk",
    introEyebrow: "NAVRHNITE KLÍMU · SLEDUJTE JEJ VÝVOJ",
    introLead: "Vytvorte svet.",
    introAccent: "Nájdite jeho body zvratu.",
    introCopy: "Nastavte hviezdu, planétu, vodu, atmosféru a rotáciu. Potom spustite vývoj klímy na zrýchlených geologických hodinách.",
    liveField: "Aktuálny stav klímy",
    startingWorlds: "VÝCHODISKOVÉ SVETY",
    presetHint: "Vyberte si smer a potom experimentujte.",
    worldBuilder: "TVORBA SVETA",
    setInputs: "Nastavte parametre",
    changeMode: "ZMENY PARAMETROV",
    liveChanges: "Priebežne",
    resetChanges: "Reštart pri zmene",
    liveChangesHint: "Zmeny zachovajú čas, teplotu aj zásoby uhlíka a vody. Predvoľby vždy vytvoria nový svet.",
    resetChangesHint: "Každá zmena parametra spustí model od nultého roku so zobrazenými hodnotami.",
    editExact: "Kliknutím zadáte presnú hodnotu",
    exactValue: "Presná hodnota",
    stellarForcing: "Žiarenie hviezdy",
    stellarFlux: "Tok žiarenia",
    stellarFluxHint: "100 % = dnešný priemerný príkon Zeme",
    albedo: "Odrazivosť / albedo",
    albedoHint: "Svetlejší povrch odráža viac svetla späť do vesmíru",
    haze: "Výškový zákal",
    hazeHint: "Pohlcuje svetlo vo vyššej atmosfére; nástroj pre titanský antiskleníkový efekt",
    planetaryBody: "Teleso planéty",
    mass: "Hmotnosť planéty",
    gravity: "povrchová gravitácia",
    retention: "index udržania atmosféry",
    geology: "Geologická aktivita",
    geologyHint: "z dnešnej pozemskej referencie · sopečný prísun pred zvetrávaním",
    water: "Zásoba H₂O na planéte",
    airborne: "v atmosfére",
    escaped: "uniklo",
    land: "Súš na povrchu",
    landHint: "Mení albedo povrchu, pokrytie vodou a tepelnú kapacitu",
    rotation: "Dĺžka dňa",
    rotationSlow: "pomalá rotácia / blízko viazanej rotácie",
    rotationHint: "Pomalá rotácia môže na osvetlenej strane vytvoriť odrazivý oblačný štít",
    days: "dní",
    gases: "Zloženie atmosféry",
    nitrogen: "Dusík / podkladová atmosféra",
    nitrogenHint: "Parciálny tlak pri povrchu; vyšší tlak rozširuje absorpčné pásma",
    carbon: "Oxid uhličitý v atmosfére",
    carbonHint: "Sopečná činnosť a zvetrávanie túto hodnotu menia počas simulácie",
    methane: "Metán",
    methaneHint: "Skleníkový plyn; vysoký pomer CH₄/CO₂ môže vytvoriť ochladzujúci organický zákal",
    hydrogen: "Vodík",
    hydrogenHint: "Zahrievanie zrážkami molekúl a ľahší únik atmosféry",
    observatory: "PLANETÁRNE OBSERVATÓRIUM",
    render: "Procedurálny 3D model klímy",
    surfaceResponse: "Odozva povrchu",
    surfaceTemp: "Povrchová teplota",
    mean: "priemer",
    pressure: "Tlak atmosféry",
    surfaceOcean: "Kvapalný oceán",
    earthOceans: "× oceán Zeme",
    oceanInputUnit: "oceánov",
    liquidCover: "kvapalný povrch",
    criticalEnvelope: "× oceán Zeme v superkritickom obale · bez kvapalného povrchu",
    waterPhase: "Skupenstvo H₂O",
    tempHistory: "Vývoj teploty",
    waterLeft: "Zostávajúca H₂O",
    geologicalClock: "GEOLOGICKÉ HODINY",
    running: "Simulácia beží",
    paused: "Simulácia je pozastavená",
    pause: "Pozastaviť",
    run: "Spustiť klímu",
    reset: "Od začiatku",
    speed: "Rýchlosť simulácie",
    diagnostics: "SPÄTNÉ VÄZBY",
    drivers: "Čo rozhoduje o klíme?",
    greenhouse: "Skleníkový účinok",
    iceLock: "Väzba ľad–albedo",
    ice: "ľad",
    cloudShield: "Oblačný štít",
    cloud: "oblačnosť",
    runaway: "Riziko nekontrolovateľného vlhkého skleníka",
    carbonThermostat: "Uhlíkový termostat",
    runawayThreshold: "Približný radiačný prah H₂O",
    noWaterLimit: "bez limitu H₂O",
    radiativeTarget: "Cieľ radiačnej rovnováhy",
    dominantOpacity: "Hlavný zdroj infračervenej opacity",
    modelValidity: "Oblasť platnosti modelu",
    phaseCheck: "H₂O voči bodu varu",
    carbonBalance: "Bilancia uhlíkového cyklu",
    volcanic: "Sopečný prísun",
    weathering: "Zvetrávanie",
    stateAtlas: "ATLAS STAVOV",
    regimes: "Režimy klímy",
    atlasHint: "Rovnaké vstupy môžu časom prejsť viacerými stavmi.",
    ledger: "ATMOSFÉRICKÁ BILANCIA",
    composition: "Zloženie",
    background: "podkladová atmosféra",
    evolving: "mení sa",
    vapor: "para",
    modelNotes: "POZNÁMKY K MODELU",
    hideNotes: "Skryť poznámky ↑",
    openNotes: "Otvoriť poznámky ↓",
    phaseTitle: "Skupenstvá H₂O závislé od tlaku",
    phaseNote: "Zásoba na povrchu sa porovnáva s tlakovou krivkou nasýtenia vody, nie s pevným limitom 373 K. Nad miestnym bodom varu prechádza do pary. Pri ≥647,096 K a parciálnom tlaku H₂O ≥220,64 bar sa voda označí ako superkritická; nad kritickou teplotou, ale pod kritickým tlakom zostáva prehriatou parou. Vlhký skleník vyžaduje zachovaný kvapalný oceán pod bodom varu — svet bez oceánu tento stav nedostane.",
    correctionTitle: "Opravený prechod do nekontrolovateľného vlhkého skleníka",
    correctionNote: "Pri odparovaní sa H₂O presúva do samostatnej zásoby pary; z planéty nezmizne. Až únik z atmosféry ju odstraňuje v geologickom čase. Radiačný strop vodnej pary platí iba dovtedy, kým H₂O zostáva. Po úniku pary suchá planéta chladne k radiačnej rovnováhe určenej skutočným množstvom N₂, CO₂, CH₄ a H₂, albedom a tokom žiarenia — teplotu nekontrolovateľného vlhkého skleníka si nededí.",
    highTempTitle: "Žiadny plyn nemá pevnú maximálnu teplotu",
    highTempNote: "Povrchová teplota sa počíta z pohltenej energie hviezdy a z infračervenej optickej hrúbky závislej od tlaku, zloženia a teploty. CO₂, CH₄, zrážkové páry H₂ ani H₂O preto nemajú vlastný strop v °C. Nekontrolovateľný vlhký skleník sleduje radiačné plató približne 282 W/m² a potom prejde na horúcu vetvu, keď sa znovu otvoria krátkovlnné a blízke infračervené okná. Hustý CO₂ zostáva kalibrovaný podľa dnešnej Venuše, účinok metánu obmedzuje fotochemický zákal a otepľovanie H₂ závisí od zrážkových partnerov. Od 1 500 K sa povrch označí ako magmatický oceán; nad 3 200 K alebo 1 000 bar je výsledok výslovne mimo kalibrovanej oblasti tohto 0D modelu.",
    carbonTitle: "Geologický uhlíkový cyklus",
    carbonNote: "Pri aktivite 100 % dodajú sopky 47 bar CO₂ za miliardu rokov, čo zodpovedá dnešnej pozemskej referencii 6 Tmol C ročne použitej v práci Lehmer a kol. Zvetrávanie sa riadi vzťahom F/F₀ = (pCO₂/p₀)^0,3 exp[(T−288 K)/25 K] a ďalej sa škáluje podľa súše, kvapalnej vody, ľadu a prísunu čerstvej horniny. Kontinentálne zvetrávanie počas úplného zaľadnenia takmer zanikne, no malá morská vetva zostáva; referenčná snehová guľa sa pod 0,2 bar CO₂ neroztopí. Silikátové zvetrávanie sa zastaví v parnej, vyschnutej alebo ≥355 K klíme. CH₄ a H₂ zostávajú zadané ručne, pretože ich sopečný pomer závisí od redoxného stavu plášťa a fotochemických dejov, ktoré tento model nerieši.",
    anchors: "Odborné zdroje",
    footerLead: "GAIA CLIMATE LAB · HRATEĽNÁ MAPA SPÄTNÝCH VÄZIEB",
    footerNote: "Referenčný prepojený 0D model klímy a uhlíka · nie je to GCM ani geochemický model zásobníkov.",
  },
} as const;

const SPEEDS = [
  { label: "1×", years: 1 },
  { label: "10×", years: 10 },
  { label: "100×", years: 100 },
  { label: "1k×", years: 1_000 },
  { label: "10k×", years: 10_000 },
  { label: "100k×", years: 100_000 },
  { label: "1M×", years: 1_000_000 },
  { label: "10M×", years: 10_000_000 },
  { label: "100M×", years: 100_000_000 },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatNumber = (value: number, digits = 1, locale: Locale = "en") =>
  new Intl.NumberFormat(locale === "sk" ? "sk-SK" : "en-US", { maximumFractionDigits: digits }).format(value);

const formatPercent = (value: number, digits = 0, locale: Locale = "en") =>
  `${formatNumber(value, digits, locale)}${locale === "sk" ? " %" : "%"}`;

const formatDays = (value: number, locale: Locale = "en") => {
  const formatted = formatNumber(value, 2, locale);
  if (locale === "en") return `${formatted} ${Math.abs(value - 1) < 1e-9 ? "day" : "days"}`;
  if (!Number.isInteger(value)) return `${formatted} dňa`;
  if (value === 1) return `${formatted} deň`;
  if (value >= 2 && value <= 4) return `${formatted} dni`;
  return `${formatted} dní`;
};

const formatYears = (years: number, locale: Locale = "en") => {
  if (years < 1) return `${formatNumber(years, 2, locale)} ${locale === "sk" ? "r." : "yr"}`;
  if (years < 1_000) return `${formatNumber(years, 0, locale)} ${locale === "sk" ? "r." : "yr"}`;
  if (years < 1_000_000) return `${formatNumber(years / 1_000, 1, locale)} ${locale === "sk" ? "tis. r." : "kyr"}`;
  if (years < 1_000_000_000) return `${formatNumber(years / 1_000_000, 2, locale)} ${locale === "sk" ? "mil. r." : "Myr"}`;
  return `${formatNumber(years / 1_000_000_000, 2, locale)} ${locale === "sk" ? "mld. r." : "Gyr"}`;
};

const formatReservoirTimescale = (reservoir: number, rate: number, locale: Locale = "en") =>
  rate > 0 && reservoir > 0 ? formatYears(reservoir / rate, locale) : "—";

const formatBarRate = (rate: number, locale: Locale = "en") => {
  const barPerGyr = rate * 1_000_000_000;
  if (Math.abs(barPerGyr) < 0.05) return locale === "sk" ? "v rovnováhe" : "balanced";
  return `${barPerGyr > 0 ? "+" : "−"}${formatNumber(Math.abs(barPerGyr), Math.abs(barPerGyr) < 10 ? 2 : 1, locale)} bar/${locale === "sk" ? "mld. r." : "Gyr"}`;
};

const formatGeology = (value: number, locale: Locale = "en") => {
  if (value === 0) return locale === "sk" ? "neaktívna" : "dormant";
  if (value < 50) return locale === "sk" ? "slabá" : "weak";
  if (value < 150) return locale === "sk" ? "pozemská" : "Earth-class";
  if (value < 250) return locale === "sk" ? "výrazná" : "vigorous";
  return locale === "sk" ? "extrémna" : "extreme";
};

const formatGas = (value: number, kind: "co2" | "ch4", locale: Locale = "en") => {
  if (kind === "co2") {
    if (value < 0.01) return `${formatNumber(value * 1_000_000, 0, locale)} ppm`;
    return `${formatNumber(value, 2, locale)} bar`;
  }
  if (value < 0.01) return `${formatNumber(value * 10_000, 1, locale)} ppm`;
  return formatPercent(value, 2, locale);
};

const WATER_PHASE_LABELS: Record<Locale, Record<string, string>> = {
  en: {},
  sk: {
    "No H₂O remaining": "Bez zostávajúcej H₂O",
    "Supercritical H₂O": "Superkritická H₂O",
    "Superheated steam": "Prehriata para",
    "Evaporating ocean": "Odparujúci sa oceán",
    "Ice-covered ocean": "Oceán pod ľadom",
    "Liquid ocean": "Kvapalný oceán",
    "Steam atmosphere": "Parná atmosféra",
    "Trace atmospheric H₂O": "Stopová H₂O v atmosfére",
  },
};

const CARBON_MODE_LABELS: Record<Locale, Record<string, string>> = {
  en: {},
  sk: {
    "Snowball shutdown": "zastavený počas úplného zaľadnenia",
    "Water cycle broken": "vodný cyklus nefunguje",
    "Balanced thermostat": "termostat v rovnováhe",
    "CO₂ accumulating": "CO₂ sa hromadí",
    "Weathering drawdown": "zvetrávanie odoberá CO₂",
  },
};

const MODEL_VALIDITY_LABELS: Record<Locale, Record<Climate["modelValidity"], string>> = {
  en: {
    Calibrated: "benchmark-calibrated",
    Extrapolated: "hot-atmosphere extrapolation",
    "High-temperature limit": "high-T chemistry limit",
    "Pressure limit": "bulk-atmosphere pressure limit",
  },
  sk: {
    Calibrated: "kalibrované referenciami",
    Extrapolated: "extrapolácia horúcej atmosféry",
    "High-temperature limit": "hranica vysokoteplotnej chémie",
    "Pressure limit": "hranica tlaku masívnej atmosféry",
  },
};

const OPACITY_LABELS: Record<Locale, Record<string, string>> = {
  en: {},
  sk: {
    "H₂ collision pairs": "Zrážkové páry H₂",
    "N₂ pressure / CIA": "Tlak N₂ / zrážková absorpcia",
    "Weak / transparent": "Slabá / priehľadná",
  },
};

const PHASE_MODE_LABELS: Record<Locale, Record<string, string>> = {
  en: {},
  sk: {
    "Ocean → steam": "Oceán → para",
    "Steam → ocean": "Para → oceán",
    "Atmospheric escape": "Únik z atmosféry",
    "No phase change": "Bez zmeny skupenstva",
  },
};

const LOSS_MODE_LABELS: Record<Locale, Record<string, string>> = {
  en: {},
  sk: {
    "Permanent water loss": "Trvalý únik vody",
    "No permanent loss": "Bez trvalého úniku",
  },
};

const TRANSITION_LABELS: Record<Locale, Record<string, string>> = {
  en: {},
  sk: {
    "Stable equilibrium": "Stabilná rovnováha",
    "Water-loss corridor": "Pásmo úniku vody",
    "Ocean evaporation": "Odparovanie oceánu",
    "Steam escape phase": "Únik parnej atmosféry",
    "Beyond H₂O critical point": "Nad kritickým bodom H₂O",
    "Molten surface": "Roztavený povrch",
    "Desiccated cooling": "Chladnutie vyschnutého sveta",
    "Dense CO₂ equilibrium": "Rovnováha hustej atmosféry CO₂",
    "Carbon accumulating under ice": "Uhlík sa hromadí pod ľadom",
    "Ice–albedo lock-in": "Uzamknutie väzbou ľad–albedo",
    "Haze shield active": "Aktívny štít zákalu",
  },
};

const localized = (dictionary: Record<Locale, Record<string, string>>, value: string, locale: Locale) =>
  dictionary[locale][value] ?? value;

// Compact saturation-curve correlation consistent with the IAPWS water/steam
// critical constants. It reproduces the NIST 379–573 K Antoine range closely
// while remaining continuous from the triple point to the critical point.
const waterSaturationPressure = (temperature: number) => {
  if (temperature <= WATER_TRIPLE_TEMPERATURE) return WATER_TRIPLE_PRESSURE;
  if (temperature >= WATER_CRITICAL_TEMPERATURE) return WATER_CRITICAL_PRESSURE;
  const tau = 1 - temperature / WATER_CRITICAL_TEMPERATURE;
  const exponent = WATER_CRITICAL_TEMPERATURE / temperature * (
    -7.85951783 * tau
    + 1.84408259 * Math.pow(tau, 1.5)
    - 11.7866497 * Math.pow(tau, 3)
    + 22.6807411 * Math.pow(tau, 3.5)
    - 15.9618719 * Math.pow(tau, 4)
    + 1.80122502 * Math.pow(tau, 7.5)
  );
  return WATER_CRITICAL_PRESSURE * Math.exp(exponent);
};

const waterBoilingTemperature = (pressureBar: number) => {
  if (pressureBar <= WATER_TRIPLE_PRESSURE) return WATER_TRIPLE_TEMPERATURE;
  if (pressureBar >= WATER_CRITICAL_PRESSURE) return WATER_CRITICAL_TEMPERATURE;
  let low = WATER_TRIPLE_TEMPERATURE;
  let high = WATER_CRITICAL_TEMPERATURE;
  for (let iteration = 0; iteration < 42; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (waterSaturationPressure(midpoint) < pressureBar) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
};

const opticalDepthForSurfaceTemperature = (surfaceTemperature: number, effectiveTemperature: number) =>
  Math.max(0, (Math.pow(surfaceTemperature / Math.max(effectiveTemperature, 1), 4) - 1) / 0.75);

const solveRadiativeEquilibrium = (
  absorbedFlux: number,
  outgoingLongwave: (temperature: number) => number,
) => {
  let low = 120;
  let high = HIGH_TEMPERATURE_MODEL_CEILING;
  if (outgoingLongwave(low) >= absorbedFlux) return low;
  if (outgoingLongwave(high) <= absorbedFlux) return high;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (outgoingLongwave(midpoint) < absorbedFlux) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
};

const computeClimate = (
  config: Config,
  oceanReserve: number,
  steamReserve = 0,
  atmosphericCO2 = config.co2,
  currentTemp?: number,
): Climate => {
  const totalWater = Math.max(0, oceanReserve + steamReserve);
  const gravity = 9.81 * Math.pow(config.mass, 0.46);
  const incomingFlux = 340 * (config.flux / 100);
  const geothermalFlux = 0.09 * (config.geology / 100);
  const oceanShare = clamp(oceanReserve / (oceanReserve + 0.32), 0, 1);
  const dryFactor = clamp(1 - totalWater / 0.55, 0, 1);
  const backgroundPressure = Math.max(0.001, config.n2 + atmosphericCO2 + config.ch4 / 100 + config.h2 / 100);
  const slowCloud = clamp((Math.log10(Math.max(config.rotation, 0.25)) - 0.3) / 2.15, 0, 1) * (0.28 + oceanShare * 0.72);
  const highPressureCloud = clamp((config.n2 - 1) / 20, 0, 1) * 0.04;
  const lowPressureCloudThrottle = clamp(backgroundPressure / 0.2, 0.02, 1);
  const cloudFeedback = clamp((0.035 + oceanShare * 0.065) * lowPressureCloudThrottle + slowCloud * 0.13 + highPressureCloud, 0, 0.3);
  const ch4PartialPressure = config.ch4 / 100;
  const methaneToCO2 = ch4PartialPressure / Math.max(atmosphericCO2, 1e-8);
  const organicHazePotential = clamp(Math.log10(Math.max(methaneToCO2, 0.1) / 0.1) / 1.2, 0, 1)
    * clamp(ch4PartialPressure / 1e-4, 0, 1);
  const hazeFeedback = clamp(config.haze * 0.17 + organicHazePotential * 0.12, 0, 0.22);
  const effectiveHaze = hazeFeedback / 0.17;
  const preIceAlbedo = clamp(config.albedo + cloudFeedback + hazeFeedback, 0.05, 0.9);
  const pressureBroadening = 1 + 0.09 * Math.log1p(backgroundPressure);
  const pressureAvailability = clamp(backgroundPressure / (backgroundPressure + 0.05), 0.03, 1);
  const co2Greenhouse = atmosphericCO2 > 0
    ? clamp((6 + 4.3 * Math.log(atmosphericCO2 / 0.00028)) * pressureBroadening * pressureAvailability, 0, 95)
    : 0;
  const methaneMix = config.ch4 / 100;
  const ch4Greenhouse = methaneMix > 0
    ? clamp((2.5 + 2.2 * Math.log(methaneMix / 1.8e-6)) * pressureBroadening * pressureAvailability, 0, 35)
    : 0;
  const hydrogenGreenhouse = 18 * Math.sqrt(config.h2 / 100) * Math.sqrt(pressureAvailability);
  const nitrogenCIA = clamp(1.5 * Math.pow(config.n2 / 10, 1.4), 0, 45);
  const backgroundGreenhouse = co2Greenhouse + ch4Greenhouse + hydrogenGreenhouse + nitrogenCIA;
  const dryRadiator = 255 * Math.pow(config.flux / 100, 0.25) * Math.pow((1 - preIceAlbedo) / 0.7, 0.25);
  const earlyTarget = dryRadiator + backgroundGreenhouse - effectiveHaze * 7;
  const naturalIceCoverage = clamp((260 - earlyTarget) / 36, 0, 1) * clamp(oceanShare * 1.05, 0, 1);
  // A hard Snowball retains hysteresis until volcanic CO₂ reaches a model-
  // dependent deglaciation range. Here 0.2 bar sits within published 0.1–0.3
  // bar estimates for a bright, globally ice-covered Earth-like planet.
  const hardSnowballLock = currentTemp !== undefined && currentTemp < 258 && oceanReserve > 0.2 && atmosphericCO2 < 0.2 && config.flux < 110;
  const iceCoverage = Math.max(naturalIceCoverage, hardSnowballLock ? 0.92 : 0);
  const iceFeedback = clamp(iceCoverage * 0.27, 0, 0.3);
  const albedo = clamp(preIceAlbedo + iceFeedback, 0.05, 0.9);
  const absorbedFlux = incomingFlux * (1 - albedo) + geothermalFlux;
  const radiativeTemp = Math.pow(Math.max(absorbedFlux, 1) / STEFAN_BOLTZMANN, 0.25);
  const dryPreviewTemp = radiativeTemp + backgroundGreenhouse;
  const humidityPotential = clamp((dryPreviewTemp - 205) / 80, 0, 1) * clamp(oceanReserve / 1.05, 0, 1.5);
  const waterGreenhouse = 42 * oceanShare * clamp((dryPreviewTemp - 205) / 80, 0, 1);
  const steamPressure = 273 * steamReserve;
  // Retained for the diagnostic load meter; the actual high-temperature target
  // is solved from outgoing radiation below, not by adding this value in kelvin.
  const steamGreenhouse = steamPressure > 0 ? clamp(42 * Math.log1p(steamPressure / 0.08), 0, 420) : 0;
  // The dense branch anchors modern Venus. Pressures above the Venus range are
  // handled as optical-depth extensions instead of saturating this kelvin term.
  const denseCO2Warming = atmosphericCO2 > 1 && backgroundPressure > 10
    ? 435 * (1 - Math.exp(-Math.max(0, atmosphericCO2 - 1) / 25)) * clamp(backgroundPressure / 80, 0, 1)
    : 0;
  const preRunawayTemp = radiativeTemp + backgroundGreenhouse + waterGreenhouse + denseCO2Warming - effectiveHaze * 7;
  const dryCalibrationTemp = Math.max(120, radiativeTemp + backgroundGreenhouse + denseCO2Warming - effectiveHaze * 7);

  // Convert the calibrated Earth/Mars/Venus branch into a grey optical depth,
  // then extend it beyond the benchmark range. The temperature exponents make
  // infrared windows reopen gradually at high T, so no gas receives an
  // artificial fixed-temperature ceiling. These are deliberately conservative
  // band-grey scalings, not a replacement for line-by-line spectroscopy.
  const calibratedDryTau = opticalDepthForSurfaceTemperature(dryCalibrationTemp, radiativeTemp);
  const co2ExtremeTau = atmosphericCO2 > 90
    ? 105 * (Math.pow(atmosphericCO2 / 90, 0.42) - 1)
    : 0;
  const n2ExtremeTau = config.n2 > 100
    ? 1.5 * (Math.pow(config.n2 / 100, 0.55) - 1)
    : 0;
  const h2PartialPressure = config.h2 / 100;
  const h2CollisionTau = 0.85 * Math.sqrt(Math.max(0, h2PartialPressure * (config.n2 + atmosphericCO2 + h2PartialPressure)));
  const ch4CollisionTau = 0.16 * Math.sqrt(Math.max(0, ch4PartialPressure * atmosphericCO2));
  const dryOutgoingLongwave = (temperature: number) => {
    const safeTemperature = Math.max(120, temperature);
    const calibratedTau = calibratedDryTau * Math.pow(dryCalibrationTemp / safeTemperature, 0.2);
    const extendedCO2 = co2ExtremeTau * Math.pow(735 / safeTemperature, 0.45);
    const extendedN2 = n2ExtremeTau * Math.pow(300 / safeTemperature, 0.2);
    const collisionTau = (h2CollisionTau + ch4CollisionTau) * Math.pow(400 / safeTemperature, 0.25);
    const opticalDepth = Math.max(0, calibratedTau + extendedCO2 + extendedN2 + collisionTau);
    return STEFAN_BOLTZMANN * Math.pow(safeTemperature, 4) / (1 + 0.75 * opticalDepth);
  };
  const dryEquilibriumTemp = solveRadiativeEquilibrium(absorbedFlux, dryOutgoingLongwave);
  const dryOpticalDepth = Math.max(
    0,
    calibratedDryTau * Math.pow(dryCalibrationTemp / dryEquilibriumTemp, 0.2)
      + co2ExtremeTau * Math.pow(735 / dryEquilibriumTemp, 0.45)
      + n2ExtremeTau * Math.pow(300 / dryEquilibriumTemp, 0.2)
      + (h2CollisionTau + ch4CollisionTau) * Math.pow(400 / dryEquilibriumTemp, 0.25),
  );
  // The Simpson–Nakajima ceiling applies only while H₂O is available to form an
  // optically thick moist atmosphere; a desiccated N₂ world has no such limit.
  const criticalAbsorbedFlux = RUNAWAY_OLR_LIMIT * 0.9 * (1 + config.n2 * 0.015 + slowCloud * 0.1 + dryFactor * 0.05);
  const criticalFlux = criticalAbsorbedFlux / Math.max(0.12, 1 - albedo);
  const netHeating = Math.max(0, absorbedFlux - criticalAbsorbedFlux);
  const rawRunawayScore = clamp(
    netHeating / 70 +
      Math.max(0, preRunawayTemp - 350) / 180 +
      Math.max(0, waterGreenhouse - 28) / 80 * 0.18 -
      slowCloud * 0.12 -
      hazeFeedback * 0.3,
    0,
    1,
  );
  const runawayScore = totalWater > 0.002 ? rawRunawayScore : 0;
  const runawayActive = totalWater > 0.002 && (runawayScore > 0.58 || (preRunawayTemp > 405 && backgroundPressure > 0.5));
  const denseVenus = atmosphericCO2 > 50 && backgroundPressure > 50 && denseCO2Warming > 250;
  const radiatingSteamPressure = steamPressure + (runawayActive && oceanReserve > 0.001 ? 0.9 + oceanShare * 4.1 : 0);
  const steamEnvelope = clamp(Math.log1p(radiatingSteamPressure) / Math.log1p(273), 0, 1.15);
  const steamMix = radiatingSteamPressure / Math.max(backgroundPressure + radiatingSteamPressure, 1e-6);
  const co2Dominance = atmosphericCO2 / Math.max(atmosphericCO2 + radiatingSteamPressure, 1e-6);
  // A full Earth-ocean steam column approaches the classic ~1,600–1,700 K
  // post-runaway reopening branch. Radiatively stable lower layers can make
  // CO₂-dominated mixtures several hundred kelvin cooler near the threshold.
  const postRunawayBase = Math.max(
    650,
    720
      + 880 * Math.min(steamEnvelope, 1)
      + 120 * Math.max(0, steamEnvelope - 1)
      - 420 * co2Dominance * (1 - steamMix * 0.55),
  );
  const coolSteamTarget = 430 + 520 * steamEnvelope + 80 * Math.sqrt(clamp(Math.max(humidityPotential, steamEnvelope), 0, 1));
  const hotSteamTarget = postRunawayBase + 140 * Math.log1p(netHeating / 80);
  const postRunawayEquilibrium = netHeating > 0
    ? Math.max(dryEquilibriumTemp, hotSteamTarget)
    : Math.max(dryEquilibriumTemp, coolSteamTarget);
  const rawEquilibriumTemp = runawayActive
    ? postRunawayEquilibrium
    : totalWater <= 0.002 || denseVenus
      ? dryEquilibriumTemp
      : preRunawayTemp;
  const equilibriumTemp = clamp(rawEquilibriumTemp, 120, HIGH_TEMPERATURE_MODEL_CEILING);
  const greenhouseIndex = clamp(
    (backgroundGreenhouse + waterGreenhouse + steamGreenhouse + denseCO2Warming + Math.log1p(co2ExtremeTau + n2ExtremeTau + h2CollisionTau + ch4CollisionTau) * 28 + effectiveHaze * 2) / 180,
    0,
    1.35,
  );
  const surfaceTemp = currentTemp ?? preRunawayTemp;
  const steamFraction = totalWater > 0 ? clamp(steamReserve / totalWater, 0, 1) : 0;
  const pressure = backgroundPressure + steamPressure;
  const boilingPoint = waterBoilingTemperature(pressure);
  const boilingMargin = surfaceTemp - boilingPoint;
  const saturationPressure = waterSaturationPressure(surfaceTemp);
  const waterInventoryFloor = Math.max(1e-5, config.water * 0.0002);
  const oceanPresent = oceanReserve > waterInventoryFloor;
  const aboveCriticalTemperature = surfaceTemp >= WATER_CRITICAL_TEMPERATURE;
  const boilingOcean = oceanPresent && (aboveCriticalTemperature || boilingMargin > 0.5);
  const liquidOceanStable = oceanPresent && !boilingOcean;
  const supercriticalWater = totalWater > 0.002
    && aboveCriticalTemperature
    && steamPressure >= WATER_CRITICAL_PRESSURE;
  const retention = clamp(0.28 + Math.pow(config.mass, 0.46) * 0.42 + pressure * 0.025, 0.18, 1);
  const waterVapor = clamp(Math.max(humidityPotential, steamFraction) * (0.86 + config.h2 / 180), 0, 1);
  const moistScore = clamp((surfaceTemp - 300) / 80 + waterVapor * 0.45 + config.h2 / 240 - hazeFeedback * 0.3, 0, 1);
  const opacityScores: Array<[string, number]> = [
    ["H₂O", waterGreenhouse + steamGreenhouse + steamEnvelope * 170],
    ["CO₂", co2Greenhouse + denseCO2Warming + Math.log1p(co2ExtremeTau) * 30],
    ["H₂ collision pairs", hydrogenGreenhouse + h2CollisionTau * 18],
    ["CH₄", ch4Greenhouse + ch4CollisionTau * 18],
    ["N₂ pressure / CIA", nitrogenCIA + n2ExtremeTau * 8],
  ];
  const strongestOpacity = opacityScores.reduce((strongest, candidate) => candidate[1] > strongest[1] ? candidate : strongest);
  const dominantOpacity = strongestOpacity[1] < 5 ? "Weak / transparent" : strongestOpacity[0];
  const venusBenchmarkDomain = denseVenus
    && atmosphericCO2 <= 150
    && pressure <= 160
    && config.flux >= 160
    && config.flux <= 220
    && equilibriumTemp < 850;
  const modelValidity: Climate["modelValidity"] = pressure > 1_000
    ? "Pressure limit"
    : venusBenchmarkDomain
      ? "Calibrated"
      : equilibriumTemp >= MAGMA_OCEAN_TEMPERATURE
        ? "High-temperature limit"
        : equilibriumTemp > 700
          ? "Extrapolated"
          : "Calibrated";

  // Surface evaporation transfers water into the atmosphere. Permanent water
  // loss is a separate, much slower escape term.
  const phaseEnergyFlux = Math.max(
    netHeating,
    Math.max(0, boilingMargin) * 0.75,
    aboveCriticalTemperature ? Math.max(0, surfaceTemp - WATER_CRITICAL_TEMPERATURE) * 0.35 : 0,
  );
  const evaporationRate = (runawayActive || boilingOcean) && oceanPresent && phaseEnergyFlux > 0
    ? phaseEnergyFlux * EARTH_AREA * SECONDS_PER_YEAR / OCEAN_VAPORIZATION_ENERGY * (oceanReserve > 0.16 ? 1 : 0.35)
    : 0;
  const supersaturatedSteam = !aboveCriticalTemperature && steamPressure > saturationPressure * 1.01;
  const condensationRate = !runawayActive && !boilingOcean && supersaturatedSteam && steamReserve > 0
    ? steamReserve / clamp(350 + steamPressure * 4, 350, 8_000)
    : 0;
  const steamEscapeRate = steamReserve > 0
    ? MOIST_ESCAPE_RATE * clamp(Math.pow(config.mass, -0.46), 0.5, 2.5) * (runawayActive ? 1 : 0.35)
    : 0;
  const moistOceanEscapeRate = !runawayActive && liquidOceanStable && steamReserve < 0.001 && moistScore > 0.6
    ? MOIST_ESCAPE_RATE * Math.max(0.35, moistScore) * clamp(Math.pow(config.mass, -0.46), 0.5, 2.5)
    : 0;
  const waterLossRate = steamEscapeRate + moistOceanEscapeRate;
  const waterLossMode = waterLossRate > 0 ? "Permanent water loss" : "No permanent loss";
  const phaseRate = evaporationRate > 0 ? evaporationRate : condensationRate > 0 ? condensationRate : waterLossRate;
  const phaseMode = evaporationRate > 0 ? "Ocean → steam" : condensationRate > 0 ? "Steam → ocean" : waterLossRate > 0 ? "Atmospheric escape" : "No phase change";
  const liquidWater = liquidOceanStable || (boilingOcean && !aboveCriticalTemperature) ? clamp(oceanReserve, 0, 5) : 0;
  const waterCoverage = liquidWater > 0 ? clamp((oceanReserve / 1.25) * (1 - config.land / 150), 0, 1) : 0;
  let waterPhase = "No H₂O remaining";
  let waterPhaseDetail = "The tracked water inventory is exhausted.";
  if (supercriticalWater) {
    waterPhase = "Supercritical H₂O";
    waterPhaseDetail = `${formatNumber(surfaceTemp, 1)} K and ${formatNumber(steamPressure, 1)} bar H₂O exceed both critical coordinates; no liquid–vapor boundary remains.`;
  } else if (totalWater > waterInventoryFloor && aboveCriticalTemperature) {
    waterPhase = "Superheated steam";
    waterPhaseDetail = `${formatNumber(surfaceTemp, 1)} K is above water’s critical temperature, but pH₂O is below ${formatNumber(WATER_CRITICAL_PRESSURE, 2)} bar.`;
  } else if (oceanPresent && (boilingOcean || runawayActive)) {
    waterPhase = "Evaporating ocean";
    waterPhaseDetail = boilingMargin > 0
      ? `${formatNumber(boilingMargin, 1)} K above the ${formatNumber(boilingPoint, 1)} K boiling point at ${formatNumber(pressure, 2)} bar.`
      : "A radiative runaway is transferring the liquid reservoir into atmospheric steam.";
  } else if (liquidOceanStable && surfaceTemp < 273.15) {
    waterPhase = "Ice-covered ocean";
    waterPhaseDetail = "Surface ice overlies the retained H₂O reservoir.";
  } else if (liquidOceanStable) {
    waterPhase = "Liquid ocean";
    waterPhaseDetail = pressure >= WATER_CRITICAL_PRESSURE
      ? `Below water’s ${formatNumber(WATER_CRITICAL_TEMPERATURE, 3)} K critical temperature; total pressure is above the critical pressure, so there is no subcritical boiling point.`
      : `${formatNumber(Math.max(0, -boilingMargin), 1)} K below the ${formatNumber(boilingPoint, 1)} K boiling point at ${formatNumber(pressure, 2)} bar.`;
  } else if (steamReserve > waterInventoryFloor) {
    waterPhase = "Steam atmosphere";
    waterPhaseDetail = `${formatNumber(steamPressure, steamPressure < 0.1 ? 3 : 1)} bar H₂O is airborne with no resolved liquid reservoir.`;
  } else if (totalWater > waterInventoryFloor) {
    waterPhase = "Trace atmospheric H₂O";
    waterPhaseDetail = "Only a small vapor inventory remains.";
  }
  const snowball = surfaceTemp < 235 || (iceCoverage > 0.8 && surfaceTemp < 255);
  const lowPressure = backgroundPressure < 0.34 || (backgroundPressure < 0.6 && gravity < 6.3);
  const antiGreenhouse = (config.haze > 0.55 || organicHazePotential > 0.55) && config.ch4 > 0.01 && hazeFeedback > 0.09;
  const desiccated = config.water > 1e-4 && totalWater <= Math.max(1e-5, config.water * 0.01);
  const vaporAtmosphere = steamReserve > waterInventoryFloor && !oceanPresent;

  let state: ClimateState;
  if (surfaceTemp >= MAGMA_OCEAN_TEMPERATURE) state = "Magma ocean";
  else if (denseVenus && surfaceTemp > 600 && totalWater <= waterInventoryFloor) state = "Venus-like";
  else if (supercriticalWater) state = "Supercritical H₂O";
  else if ((runawayActive || boilingOcean) && oceanPresent) state = "Wet runaway";
  else if (vaporAtmosphere) state = "Steam atmosphere";
  else if (antiGreenhouse && surfaceTemp < 275) state = "Anti-greenhouse";
  else if (lowPressure && surfaceTemp < 280 && totalWater < 0.35) state = "Mars-like";
  else if (snowball) state = "Snowball";
  else if (surfaceTemp < 273 && oceanReserve > 0.2) state = "Icehouse";
  else if (desiccated && surfaceTemp > 315) state = "Dry runaway";
  else if (liquidOceanStable && moistScore > 0.6 && surfaceTemp > 315) state = "Moist greenhouse";
  else if (surfaceTemp > 315) state = "Hothouse";
  else if (oceanReserve < 0.18 && surfaceTemp > 245) state = "Desert planet";
  else if (oceanReserve > 2.15 && surfaceTemp > 265 && surfaceTemp < 325) state = "Waterworld";
  else state = "Habitable";

  // Walker-style continental weathering, normalized so modern Earth balances
  // 47 bar/Gyr of outgassing. A small seafloor branch remains under Snowball
  // conditions; both branches fail without a liquid-water cycle.
  const geologyFactor = config.geology / 100;
  const carbonOutgassingRate = EARTH_CO2_OUTGASSING_RATE * geologyFactor * Math.pow(config.mass, -0.08);
  const landFactor = clamp(config.land / 35, 0, 2.5);
  const waterFactor = clamp(oceanShare / (1 / 1.32), 0, 1.5);
  const temperatureFactor = Math.exp(clamp((surfaceTemp - WEATHERING_TEMP_REFERENCE) / WEATHERING_TEMP_EFOLD, -4, 4));
  const carbonFactor = Math.pow(Math.max(atmosphericCO2, 1e-8) / WEATHERING_CO2_REFERENCE, WEATHERING_CO2_EXPONENT);
  const freshRockFactor = 0.35 + 0.65 * Math.sqrt(geologyFactor);
  const liquidCycle = liquidOceanStable && oceanReserve > 0.01 && surfaceTemp >= 260 && surfaceTemp < 355 && !runawayActive;
  const iceThrottle = state === "Icehouse" ? clamp(1 - iceCoverage, 0.08, 0.65) : 1;
  const continentalRegime = snowball ? 0.01 : liquidCycle ? iceThrottle : 0;
  const seafloorRegime = snowball ? 0.08 : liquidCycle ? 1 : 0;
  const continentalWeathering = EARTH_CO2_OUTGASSING_RATE * 0.8 * landFactor * waterFactor * temperatureFactor * carbonFactor * freshRockFactor * continentalRegime;
  const seafloorWeathering = EARTH_CO2_OUTGASSING_RATE * 0.2 * clamp(waterFactor, 0, 1.2) * Math.sqrt(carbonFactor) * (0.4 + 0.6 * Math.sqrt(Math.max(geologyFactor, 0))) * seafloorRegime;
  const carbonWeatheringRate = clamp(continentalWeathering + seafloorWeathering, 0, EARTH_CO2_OUTGASSING_RATE * 60);
  const carbonNetRate = carbonOutgassingRate - carbonWeatheringRate;
  const balanceScale = Math.max(carbonOutgassingRate, EARTH_CO2_OUTGASSING_RATE * 0.05);
  let carbonCycleMode: string;
  let carbonCycleHealth: number;
  if (snowball) {
    carbonCycleMode = "Snowball shutdown";
    carbonCycleHealth = 0.12;
  } else if (runawayActive || surfaceTemp >= 355 || oceanReserve <= 0.01) {
    carbonCycleMode = "Water cycle broken";
    carbonCycleHealth = 0;
  } else if (Math.abs(carbonNetRate) <= balanceScale * 0.08) {
    carbonCycleMode = "Balanced thermostat";
    carbonCycleHealth = 1;
  } else if (carbonNetRate > 0) {
    carbonCycleMode = "CO₂ accumulating";
    carbonCycleHealth = 0.62;
  } else {
    carbonCycleMode = "Weathering drawdown";
    carbonCycleHealth = 0.78;
  }

  const stateMeta = STATE_META[state];
  let transitionLabel = "Stable equilibrium";
  if (state === "Moist greenhouse") transitionLabel = "Water-loss corridor";
  if (state === "Wet runaway") transitionLabel = "Ocean evaporation";
  if (state === "Steam atmosphere") transitionLabel = "Steam escape phase";
  if (state === "Supercritical H₂O") transitionLabel = "Beyond H₂O critical point";
  if (state === "Magma ocean") transitionLabel = "Molten surface";
  if (state === "Dry runaway") transitionLabel = "Desiccated cooling";
  if (state === "Venus-like") transitionLabel = "Dense CO₂ equilibrium";
  if (state === "Snowball") transitionLabel = carbonNetRate > 0 ? "Carbon accumulating under ice" : "Ice–albedo lock-in";
  if (state === "Anti-greenhouse") transitionLabel = "Haze shield active";

  return {
    state,
    stateEmoji: stateMeta.emoji,
    stateTone: stateMeta.tone,
    stateSummary: stateMeta.summary,
    equilibriumTemp,
    preRunawayTemp,
    surfaceTemp,
    incomingFlux,
    netHeating,
    albedo,
    pressure,
    steamPressure,
    gravity,
    waterCoverage,
    iceCoverage,
    cloudCover: clamp(cloudFeedback / 0.34, 0, 1),
    waterVapor,
    greenhouseIndex,
    iceFeedback,
    cloudFeedback,
    hazeFeedback,
    runawayScore,
    moistScore,
    criticalFlux,
    liquidWater,
    retention,
    waterLossRate,
    waterLossMode,
    phaseRate,
    phaseMode,
    waterPhase,
    waterPhaseDetail,
    boilingPoint,
    boilingMargin,
    carbonOutgassingRate,
    carbonWeatheringRate,
    carbonNetRate,
    carbonCycleMode,
    carbonCycleHealth,
    absorbedFlux,
    dryOpticalDepth,
    dominantOpacity,
    modelValidity,
    runawayActive,
    transitionLabel,
  };
};

const initialClimate = computeClimate(DEFAULTS, DEFAULTS.water, 0, DEFAULTS.co2);

const createSimulation = (config: Config): Simulation => {
  const climate = computeClimate(config, config.water, 0, config.co2);
  return {
    year: 0,
    oceanReserve: config.water,
    steamReserve: 0,
    escapedWater: 0,
    co2: config.co2,
    temp: climate.preRunawayTemp,
    history: [{ year: 0, temp: climate.preRunawayTemp, water: config.water, co2: config.co2 }],
  };
};

const describeWaterPhase = (climate: Climate, locale: Locale) => {
  const number = (value: number, digits = 1) => formatNumber(value, digits, locale);
  if (locale === "en") {
    if (climate.waterPhase === "No H₂O remaining") return "The tracked water inventory is exhausted.";
    if (climate.waterPhase === "Supercritical H₂O") return `${number(climate.surfaceTemp, 1)} K and ${number(climate.steamPressure, 1)} bar H₂O exceed both critical coordinates; no liquid–vapor boundary remains.`;
    if (climate.waterPhase === "Superheated steam") return `${number(climate.surfaceTemp, 1)} K is above water’s critical temperature, but pH₂O is below ${number(WATER_CRITICAL_PRESSURE, 2)} bar.`;
    if (climate.waterPhase === "Evaporating ocean") return climate.boilingMargin > 0
      ? `${number(climate.boilingMargin, 1)} K above the ${number(climate.boilingPoint, 1)} K boiling point at ${number(climate.pressure, 2)} bar.`
      : "A radiative runaway is transferring the liquid reservoir into atmospheric steam.";
    if (climate.waterPhase === "Ice-covered ocean") return "Surface ice overlies the retained H₂O reservoir.";
    if (climate.waterPhase === "Liquid ocean") return climate.pressure >= WATER_CRITICAL_PRESSURE
      ? `Below water’s ${number(WATER_CRITICAL_TEMPERATURE, 3)} K critical temperature; total pressure is above the critical pressure, so there is no subcritical boiling point.`
      : `${number(Math.max(0, -climate.boilingMargin), 1)} K below the ${number(climate.boilingPoint, 1)} K boiling point at ${number(climate.pressure, 2)} bar.`;
    if (climate.waterPhase === "Steam atmosphere") return `${number(climate.steamPressure, climate.steamPressure < 0.1 ? 3 : 1)} bar H₂O is airborne with no resolved liquid reservoir.`;
    return "Only a small vapor inventory remains.";
  }

  if (climate.waterPhase === "No H₂O remaining") return "Sledovaná zásoba vody sa vyčerpala.";
  if (climate.waterPhase === "Supercritical H₂O") return `${number(climate.surfaceTemp, 1)} K a ${number(climate.steamPressure, 1)} bar H₂O prekračujú obe kritické hodnoty; rozhranie kvapalina–para už neexistuje.`;
  if (climate.waterPhase === "Superheated steam") return `${number(climate.surfaceTemp, 1)} K je nad kritickou teplotou vody, ale pH₂O zostáva pod ${number(WATER_CRITICAL_PRESSURE, 2)} bar.`;
  if (climate.waterPhase === "Evaporating ocean") return climate.boilingMargin > 0
    ? `${number(climate.boilingMargin, 1)} K nad miestnym bodom varu ${number(climate.boilingPoint, 1)} K pri tlaku ${number(climate.pressure, 2)} bar.`
    : "Radiačný skleníkový únik presúva kvapalnú zásobu do atmosférickej pary.";
  if (climate.waterPhase === "Ice-covered ocean") return "Zachovanú zásobu H₂O pokrýva povrchový ľad.";
  if (climate.waterPhase === "Liquid ocean") return climate.pressure >= WATER_CRITICAL_PRESSURE
    ? `Teplota je pod kritickou hodnotou vody ${number(WATER_CRITICAL_TEMPERATURE, 3)} K; celkový tlak je nad kritickým tlakom, preto nejde o podkritický var.`
    : `${number(Math.max(0, -climate.boilingMargin), 1)} K pod miestnym bodom varu ${number(climate.boilingPoint, 1)} K pri tlaku ${number(climate.pressure, 2)} bar.`;
  if (climate.waterPhase === "Steam atmosphere") return `${number(climate.steamPressure, climate.steamPressure < 0.1 ? 3 : 1)} bar H₂O je v atmosfére bez rozlíšenej kvapalnej zásoby.`;
  return "Zostáva už len malé množstvo vodnej pary.";
};

const describeClimate = (climate: Climate, locale: Locale, phaseDetail: string) => {
  const number = (value: number, digits = 1) => formatNumber(value, digits, locale);
  if (locale === "en") {
    if (climate.state === "Wet runaway") return `The surface reservoir is evaporating. ${phaseDetail} Evaporation only moves H₂O into the atmosphere; escape removes it on the longer XUV-limited clock.`;
    if (climate.state === "Steam atmosphere") return `The liquid ocean is effectively airborne as ${number(climate.steamPressure, 1)} bar of H₂O. ${phaseDetail}`;
    if (climate.state === "Supercritical H₂O") return `Both ${number(WATER_CRITICAL_TEMPERATURE, 3)} K and ${number(WATER_CRITICAL_PRESSURE, 2)} bar pH₂O are exceeded. Liquid and vapor are no longer distinct phases in this zero-dimensional treatment.`;
    if (climate.state === "Magma ocean") return `The surface has crossed the ${number(MAGMA_OCEAN_TEMPERATURE, 0)} K silicate-melt marker. The ${number(climate.equilibriumTemp, 0)} K radiative target is an energy-balance extrapolation; silicate vapor and high-temperature gas chemistry are not resolved.`;
    if (climate.state === "Dry runaway") return `The H₂O radiation ceiling no longer applies. With the tracked water gone, this world relaxes toward ${number(climate.equilibriumTemp - 273.15, 0)}°C from the gases actually left behind; weathering remains shut down.`;
    if (climate.state === "Venus-like" && climate.modelValidity === "Pressure limit") return "CO₂ still dominates the infrared opacity, but this bulk atmospheric pressure is outside the model’s rocky-planet calibration. The displayed target is an optical-depth extrapolation, not a Venus-grade prediction.";
    if (climate.state === "Venus-like") return "The dense-CO₂ branch is calibrated against modern Venus: roughly 740 K and 93 bar at its present solar forcing. With no liquid-water cycle, volcanic CO₂ is not balanced by silicate weathering.";
    if (climate.state === "Moist greenhouse") return `The upper atmosphere is wet enough for long-term escape while the surface reservoir remains liquid: ${phaseDetail}`;
    if (climate.state === "Snowball") return `Continental weathering has collapsed, while a small seafloor sink remains. Volcanism is adding CO₂ at a net ${formatBarRate(climate.carbonNetRate, locale)} until greenhouse warming can break the ice lock.`;
    if (climate.state === "Anti-greenhouse") return "The haze absorbs incoming light high above the surface. It cools this world even while greenhouse gases remain present below.";
    return `The carbon cycle is ${climate.carbonCycleMode.toLowerCase()}: temperature, rainfall, exposed land, and pCO₂ set weathering while geology supplies new CO₂.`;
  }

  if (climate.state === "Wet runaway") return `Povrchová zásoba sa odparuje. ${phaseDetail} Odparovanie iba presúva H₂O do atmosféry; až únik obmedzený žiarením XUV ju odstraňuje v oveľa dlhšom čase.`;
  if (climate.state === "Steam atmosphere") return `Pôvodný oceán je v atmosfére ako ${number(climate.steamPressure, 1)} bar H₂O. ${phaseDetail}`;
  if (climate.state === "Supercritical H₂O") return `H₂O prekročila ${number(WATER_CRITICAL_TEMPERATURE, 3)} K aj parciálny tlak ${number(WATER_CRITICAL_PRESSURE, 2)} bar. V tomto 0D modeli už kvapalina a para nie sú oddelené fázy.`;
  if (climate.state === "Magma ocean") return `Povrch prekročil orientačnú hranicu tavenia silikátov ${number(MAGMA_OCEAN_TEMPERATURE, 0)} K. Radiačný cieľ ${number(climate.equilibriumTemp, 0)} K je extrapolácia energetickej bilancie; pary silikátov ani vysokoteplotná chémia plynov sa neriešia.`;
  if (climate.state === "Dry runaway") return `Radiačný strop H₂O už neplatí. Po úniku sledovanej vody sa svet približuje k ${number(climate.equilibriumTemp - 273.15, 0)} °C podľa plynov, ktoré skutočne zostali; zvetrávanie je zastavené.`;
  if (climate.state === "Venus-like" && climate.modelValidity === "Pressure limit") return "Infračervenú opacitu stále určuje CO₂, ale tento celkový tlak už leží mimo kalibrácie modelu pre kamenné planéty. Zobrazený cieľ je extrapolácia optickej hrúbky, nie predpoveď s presnosťou modelu Venuše.";
  if (climate.state === "Venus-like") return "Vetva hustého CO₂ je kalibrovaná podľa dnešnej Venuše: približne 740 K a 93 bar pri jej súčasnom slnečnom žiarení. Bez cyklu kvapalnej vody sopečný CO₂ nevyvažuje silikátové zvetrávanie.";
  if (climate.state === "Moist greenhouse") return `Horná atmosféra je dosť vlhká na dlhodobý únik vody, kým povrchový oceán zostáva kvapalný: ${phaseDetail}`;
  if (climate.state === "Snowball") return `Kontinentálne zvetrávanie takmer zaniklo, no malý odber na morskom dne zostáva. Sopky pridávajú CO₂ rýchlosťou ${formatBarRate(climate.carbonNetRate, locale)}, kým skleníkové otepľovanie neprelomí ľadový stav.`;
  if (climate.state === "Anti-greenhouse") return "Zákal pohlcuje prichádzajúce svetlo vysoko nad povrchom. Planétu ochladzuje, hoci pod ním zostávajú skleníkové plyny.";
  return `Uhlíkový cyklus: ${localized(CARBON_MODE_LABELS, climate.carbonCycleMode, locale)}. Zvetrávanie určuje teplota, zrážky, odkrytá súš a pCO₂; geologická aktivita dodáva nový CO₂.`;
};

const formatEditableNumber = (value: number) => {
  if (!Number.isFinite(value)) return "";
  if (value !== 0 && Math.abs(value) < 1e-6) return value.toExponential(6);
  return String(Number(value.toPrecision(11)));
};

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  display,
  hint,
  inputValue,
  inputStep,
  inputMin,
  inputMax,
  inputUnit,
  editHint,
  exactLabel,
  onInputChange,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint?: string;
  inputValue?: number;
  inputStep?: number;
  inputMin?: number;
  inputMax?: number;
  inputUnit?: string;
  editHint: string;
  exactLabel: string;
  onInputChange?: (value: number) => void;
  onChange: (value: number) => void;
}) {
  const exactValue = inputValue ?? value;
  const minimum = inputMin ?? min;
  const commitChange = onInputChange ?? onChange;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatEditableNumber(exactValue));
  const cancelEdit = useRef(false);

  const beginEditing = () => {
    cancelEdit.current = false;
    setDraft(formatEditableNumber(exactValue));
    setEditing(true);
  };

  const finishEditing = () => {
    if (cancelEdit.current) {
      cancelEdit.current = false;
      setDraft(formatEditableNumber(exactValue));
      setEditing(false);
      return;
    }

    const parsed = Number.parseFloat(draft.trim().replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setDraft(formatEditableNumber(exactValue));
      setEditing(false);
      return;
    }

    const nextValue = inputMax === undefined
      ? Math.max(minimum, parsed)
      : clamp(parsed, minimum, inputMax);
    setDraft(formatEditableNumber(nextValue));
    setEditing(false);
    if (nextValue !== exactValue) commitChange(nextValue);
  };

  return (
    <div className="range-control">
      <div className="range-label">
        <span>{label}</span>
        {editing ? (
          <span className="range-editor">
            <input
              autoFocus
              className="range-number-input"
              type="number"
              inputMode="decimal"
              min={minimum}
              max={inputMax}
              step={inputStep ?? step}
              value={draft}
              aria-label={`${exactLabel}: ${label}`}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={finishEditing}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit.current = true;
                  event.currentTarget.blur();
                }
              }}
            />
            {inputUnit ? <span>{inputUnit}</span> : null}
          </span>
        ) : (
          <button className="range-value-button" type="button" onClick={beginEditing} title={`${display} · ${editHint}`} aria-label={`${label}: ${display}. ${editHint}`}>
            <span>{display}</span><span className="edit-mark" aria-hidden="true">✎</span>
          </button>
        )}
      </div>
      <input type="range" min={min} max={max} step={step} value={clamp(value, min, max)} aria-label={label} aria-valuetext={display} onChange={(event) => onChange(Number(event.target.value))} />
      {hint ? <span className="range-hint">{hint}</span> : null}
    </div>
  );
}

function Meter({ label, value, color, detail }: { label: string; value: number; color: string; detail: string }) {
  return (
    <div className="meter-row">
      <div className="meter-topline"><span>{label}</span><span>{detail}</span></div>
      <div className="meter-track"><span className={`meter-fill ${color}`} style={{ width: `${clamp(value, 0.04, 1) * 100}%` }} /></div>
    </div>
  );
}

function Sparkline({ history, field, color }: { history: Sample[]; field: "temp" | "water"; color: string }) {
  const values = history.map((sample) => (field === "temp" ? sample.temp : sample.water));
  const min = field === "temp" ? 180 : 0;
  const max = field === "temp" ? HIGH_TEMPERATURE_MODEL_CEILING : Math.max(1, ...values, 1);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 100 - clamp((value - min) / (max - min), 0, 1) * 100;
    return `${x},${y}`;
  }).join(" ");

  return <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2.8" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function Home() {
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [simulation, setSimulation] = useState<Simulation>(() => ({
    year: 0,
    oceanReserve: DEFAULTS.water,
    steamReserve: 0,
    escapedWater: 0,
    co2: DEFAULTS.co2,
    temp: initialClimate.preRunawayTemp,
    history: [{ year: 0, temp: initialClimate.preRunawayTemp, water: DEFAULTS.water, co2: DEFAULTS.co2 }],
  }));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(100);
  const [showNotes, setShowNotes] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("live");
  const [locale, setLocale] = useState<Locale>("en");
  const configRef = useRef(config);
  const runningRef = useRef(running);
  const notesRef = useRef<HTMLElement>(null);
  const simulationEpoch = useRef(0);
  const sampleClock = useRef(0);

  const climate = useMemo(
    () => computeClimate(config, simulation.oceanReserve, simulation.steamReserve, simulation.co2, simulation.temp),
    [config, simulation.oceanReserve, simulation.steamReserve, simulation.co2, simulation.temp],
  );

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { runningRef.current = running; }, [running]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (!runningRef.current) return;
      const realDelta = clamp((now - previous) / 1_000, 0, 0.08);
      previous = now;
      const yearsDelta = realDelta * speed;
      sampleClock.current += realDelta;
      const tickEpoch = simulationEpoch.current;
      setSimulation((previousState) => {
        if (tickEpoch !== simulationEpoch.current) return previousState;
        const currentConfig = configRef.current;
        let nextOcean = previousState.oceanReserve;
        let nextSteam = previousState.steamReserve;
        let nextEscaped = previousState.escapedWater;
        let nextCO2 = previousState.co2;
        let nextTemp = previousState.temp;
        const substeps = Math.min(96, Math.max(1, Math.ceil(yearsDelta / 50_000)));
        const stepYears = yearsDelta / substeps;

        for (let step = 0; step < substeps; step += 1) {
          const before = computeClimate(currentConfig, nextOcean, nextSteam, nextCO2, nextTemp);
          if (before.phaseMode === "Ocean → steam") {
            const evaporated = Math.min(nextOcean, before.phaseRate * stepYears);
            nextOcean -= evaporated;
            nextSteam += evaporated;
          } else if (before.phaseMode === "Steam → ocean") {
            const condensed = Math.min(nextSteam, before.phaseRate * stepYears);
            nextSteam -= condensed;
            nextOcean += condensed;
          }

          const escaped = Math.min(nextSteam + nextOcean, before.waterLossRate * stepYears);
          if (escaped > 0) {
            const escapedSteam = Math.min(nextSteam, escaped);
            nextSteam -= escapedSteam;
            const escapedOcean = escaped - escapedSteam;
            nextOcean = Math.max(0, nextOcean - escapedOcean);
            nextEscaped += escaped;
          }

          nextCO2 = clamp(nextCO2 + before.carbonNetRate * stepYears, 1e-8, MAX_ATMOSPHERIC_CO2);
          const after = computeClimate(currentConfig, nextOcean, nextSteam, nextCO2, nextTemp);
          const relaxation = after.state === "Wet runaway" || after.state === "Steam atmosphere" || after.state === "Supercritical H₂O" || after.state === "Magma ocean"
            ? 180 + (nextOcean + nextSteam) * 60
            : after.state === "Dry runaway"
              ? 80
              : 100 + nextOcean * 45;
          const temperatureAlpha = 1 - Math.exp(-stepYears / relaxation);
          nextTemp += (after.equilibriumTemp - nextTemp) * temperatureAlpha;
        }

        const nextYear = previousState.year + yearsDelta;
        const nextHistory = [...previousState.history];
        if (sampleClock.current > 0.28 || nextHistory.length === 1) {
          nextHistory.push({ year: nextYear, temp: nextTemp, water: nextOcean + nextSteam, co2: nextCO2 });
          if (nextHistory.length > 46) nextHistory.shift();
          sampleClock.current = 0;
        }
        return {
          year: nextYear,
          oceanReserve: nextOcean,
          steamReserve: nextSteam,
          escapedWater: nextEscaped,
          co2: nextCO2,
          temp: nextTemp,
          history: nextHistory,
        };
      });
      if (runningRef.current) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, speed]);

  const setParameter = (key: keyof Config, value: number) => {
    simulationEpoch.current += 1;
    const currentConfig = configRef.current;

    if (editMode === "reset") {
      const resetConfig: Config = {
        ...currentConfig,
        water: simulation.oceanReserve + simulation.steamReserve,
        co2: simulation.co2,
        [key]: value,
      };
      configRef.current = resetConfig;
      setConfig(resetConfig);
      setSimulation(createSimulation(resetConfig));
      sampleClock.current = 0;
      return;
    }

    const nextConfig: Config = {
      ...currentConfig,
      [key]: value,
      ...(key === "water" ? { water: value + simulation.escapedWater } : null),
    };
    configRef.current = nextConfig;
    setConfig(nextConfig);

    if (key === "co2" || key === "water") {
      setSimulation((previousState) => {
        let oceanReserve = previousState.oceanReserve;
        let steamReserve = previousState.steamReserve;
        let atmosphericCO2 = previousState.co2;

        if (key === "co2") atmosphericCO2 = value;
        if (key === "water") {
          const currentWater = oceanReserve + steamReserve;
          if (value < currentWater && currentWater > 0) {
            const scale = value / currentWater;
            oceanReserve *= scale;
            steamReserve *= scale;
          } else if (value > currentWater) {
            const addedWater = value - currentWater;
            const updatedClimate = computeClimate(nextConfig, oceanReserve, steamReserve, atmosphericCO2, previousState.temp);
            const entersAsSteam = updatedClimate.runawayActive
              || previousState.temp >= updatedClimate.boilingPoint
              || previousState.temp >= WATER_CRITICAL_TEMPERATURE
              || updatedClimate.state === "Steam atmosphere"
              || updatedClimate.state === "Supercritical H₂O";
            if (entersAsSteam) steamReserve += addedWater;
            else oceanReserve += addedWater;
          }
        }

        const history = [...previousState.history, {
          year: previousState.year,
          temp: previousState.temp,
          water: oceanReserve + steamReserve,
          co2: atmosphericCO2,
        }];
        if (history.length > 46) history.shift();
        return { ...previousState, oceanReserve, steamReserve, co2: atmosphericCO2, history };
      });
    }
  };

  const applyPreset = (preset: Config) => {
    simulationEpoch.current += 1;
    runningRef.current = false;
    configRef.current = preset;
    setConfig(preset);
    setSimulation(createSimulation(preset));
    setRunning(false);
  };

  const reset = () => {
    simulationEpoch.current += 1;
    const resetConfig: Config = {
      ...configRef.current,
      water: simulation.oceanReserve + simulation.steamReserve,
      co2: simulation.co2,
    };
    configRef.current = resetConfig;
    setConfig(resetConfig);
    setSimulation(createSimulation(resetConfig));
    sampleClock.current = 0;
  };

  const toggleRunning = () => {
    setRunning((value) => {
      runningRef.current = !value;
      return !value;
    });
  };

  const revealFieldNotes = () => {
    setShowNotes(true);
    window.setTimeout(() => notesRef.current?.scrollIntoView({ block: "start" }), 0);
  };

  const conditionTone = STATE_META[climate.state].tone;
  const stateSlug = climate.state.toLowerCase().replace(/₂/g, "2").replace(/[^a-z0-9]+/g, "-");
  const totalWaterRemaining = simulation.oceanReserve + simulation.steamReserve;
  const copy = UI[locale];
  const number = (value: number, digits = 1) => formatNumber(value, digits, locale);
  const percent = (value: number, digits = 0) => formatPercent(value, digits, locale);
  const stateLabel = STATE_LABELS[locale][climate.state];
  const phaseLabel = localized(WATER_PHASE_LABELS, climate.waterPhase, locale);
  const phaseDetail = describeWaterPhase(climate, locale);
  const transitionLabel = localized(TRANSITION_LABELS, climate.transitionLabel, locale);
  const visualRegime = locale === "sk" ? VISUAL_REGIME_SK[climate.state] : VISUAL_REGIME[climate.state];
  const surfaceWaterDetail = climate.waterPhase === "Supercritical H₂O"
    ? `${number(totalWaterRemaining, 2)} ${copy.criticalEnvelope}`
    : `${number(simulation.steamReserve, 2)} ${copy.airborne} · ${percent(climate.waterCoverage * 100)} ${copy.liquidCover}`;
  const phaseBoundaryLabel = climate.waterPhase === "No H₂O remaining"
    ? locale === "sk" ? "zásoba sa vyčerpala" : "inventory exhausted"
    : climate.waterPhase === "Supercritical H₂O"
      ? "T ≥ Tc · pH₂O ≥ pc"
      : climate.surfaceTemp >= WATER_CRITICAL_TEMPERATURE
        ? locale === "sk" ? "prehriata para nad Tc" : "superheated above Tc"
        : `${climate.boilingMargin >= 0 ? "+" : "−"}${number(Math.abs(climate.boilingMargin), 1)} K ${locale === "sk" ? "voči miestnemu bodu varu" : "vs local boil"}`;
  const phaseReservoir = climate.phaseMode === "Ocean → steam"
    ? simulation.oceanReserve
    : climate.phaseMode === "Steam → ocean"
      ? simulation.steamReserve
      : totalWaterRemaining;

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label={locale === "sk" ? "Domovská stránka Gaia Climate Lab" : "Gaia Climate Lab home"}>
          <span className="brand-orbit" aria-hidden="true"><span /></span>
          <span><span className="brand-kicker">{copy.brandKicker}</span><span className="brand-title">Gaia <em>Climate Lab</em></span></span>
        </a>
        <div className="topbar-right">
          <span className="model-chip">{copy.modelChip}</span>
          <div className="language-picker" role="group" aria-label={copy.language}>
            <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} lang="en">EN</button>
            <button type="button" className={locale === "sk" ? "active" : ""} onClick={() => setLocale("sk")} lang="sk">SK</button>
          </div>
          <button className="text-button" type="button" onClick={revealFieldNotes} aria-controls="field-notes"><span className="info-dot">i</span> {copy.fieldNotes}</button>
        </div>
      </header>

      <section className="intro" id="top">
        <div>
          <p className="eyebrow">{copy.introEyebrow}</p>
          <h1>{copy.introLead}<br /><span>{copy.introAccent}</span></h1>
          <p className="intro-copy">{copy.introCopy}</p>
        </div>
        <div className="intro-signal"><span className="signal-pulse" /><span>{copy.liveField}</span><strong>{transitionLabel}</strong></div>
      </section>

      <section className="preset-strip" aria-label={copy.startingWorlds}>
        <div className="strip-label"><span className="eyebrow">{copy.startingWorlds}</span><span>{copy.presetHint}</span></div>
        <div className="preset-list">
          {PRESETS.map((preset) => {
            const presetCopy = PRESET_COPY[locale][preset.id];
            return <button className="preset-button" type="button" key={preset.id} onClick={() => applyPreset(preset.config)} title={presetCopy.description}><span className="preset-icon">{preset.icon}</span><span>{presetCopy.label}</span></button>;
          })}
        </div>
      </section>

      <section className="lab-grid">
        <aside className="panel control-panel">
          <div className="panel-heading"><div><span className="eyebrow">{copy.worldBuilder}</span><h2>{copy.setInputs}</h2></div><span className="panel-index">01</span></div>
          <div className="change-mode">
            <span className="change-mode-label">{copy.changeMode}</span>
            <div className="segmented-control" role="group" aria-label={copy.changeMode}>
              <button type="button" className={editMode === "live" ? "active" : ""} aria-pressed={editMode === "live"} onClick={() => setEditMode("live")}>{copy.liveChanges}</button>
              <button type="button" className={editMode === "reset" ? "active" : ""} aria-pressed={editMode === "reset"} onClick={() => setEditMode("reset")}>{copy.resetChanges}</button>
            </div>
            <span className="change-mode-hint">{editMode === "live" ? copy.liveChangesHint : copy.resetChangesHint}</span>
          </div>
          <div className="control-section">
            <div className="control-section-title"><span>☼</span> {copy.stellarForcing}</div>
            <RangeControl label={copy.stellarFlux} value={config.flux} min={30} max={230} step={0.1} display={`${percent(config.flux, 1)} · ${number(340 * config.flux / 100, 0)} W/m²`} hint={copy.stellarFluxHint} inputMin={0} inputMax={MAX_DIRECT_INPUT} inputUnit="%" editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("flux", value)} />
            <RangeControl label={copy.albedo} value={config.albedo} min={0.05} max={0.85} step={0.01} display={number(config.albedo, 2)} hint={copy.albedoHint} inputMin={0} inputMax={1} editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("albedo", value)} />
            <RangeControl label={copy.haze} value={config.haze} min={0} max={1} step={0.01} display={percent(config.haze * 100)} hint={copy.hazeHint} inputValue={config.haze * 100} inputStep={1} inputMin={0} inputMax={100} inputUnit="%" editHint={copy.editExact} exactLabel={copy.exactValue} onInputChange={(value) => setParameter("haze", value / 100)} onChange={(value) => setParameter("haze", value)} />
          </div>
          <div className="control-section">
            <div className="control-section-title"><span>◉</span> {copy.planetaryBody}</div>
            <RangeControl label={copy.mass} value={config.mass} min={0.1} max={3} step={0.001} display={`${number(config.mass, 3)} M⊕`} hint={`${number(climate.gravity, 1)} m/s² ${copy.gravity} · ${percent(climate.retention * 100)} ${copy.retention}`} inputMin={0.01} inputMax={MAX_DIRECT_INPUT} inputUnit="M⊕" editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("mass", value)} />
            <RangeControl label={copy.geology} value={config.geology} min={0} max={300} step={1} display={`${number(climate.carbonOutgassingRate * 1e9, 1)} bar CO₂/${locale === "sk" ? "mld. r." : "Gyr"}`} hint={`${percent(config.geology)} · ${formatGeology(config.geology, locale)} · ${copy.geologyHint}`} inputMin={0} inputMax={MAX_DIRECT_INPUT} inputUnit="%" editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("geology", value)} />
            <RangeControl label={copy.water} value={totalWaterRemaining} min={0} max={20} step={0.001} display={`${number(totalWaterRemaining, 3)} ${copy.earthOceans}`} hint={`${number(simulation.steamReserve, 3)} ${copy.airborne} · ${number(simulation.escapedWater, 3)} ${copy.escaped}`} inputMin={0} inputMax={MAX_DIRECT_INPUT} inputUnit={copy.oceanInputUnit} editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("water", value)} />
            <RangeControl label={copy.land} value={config.land} min={0} max={100} step={1} display={percent(config.land)} hint={copy.landHint} inputMin={0} inputMax={100} inputUnit="%" editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("land", value)} />
            <RangeControl label={copy.rotation} value={config.rotation} min={0.25} max={500} step={0.01} display={config.rotation > 100 ? copy.rotationSlow : formatDays(config.rotation, locale)} hint={copy.rotationHint} inputMin={0.01} inputMax={MAX_DIRECT_INPUT} inputUnit={copy.days} editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("rotation", value)} />
          </div>
          <div className="control-section gases-section">
            <div className="control-section-title"><span>∿</span> {copy.gases}</div>
            <RangeControl label={copy.nitrogen} value={config.n2} min={0} max={100} step={0.001} display={`${number(config.n2, config.n2 < 0.1 ? 3 : 2)} bar`} hint={copy.nitrogenHint} inputMin={0} inputMax={MAX_DIRECT_INPUT} inputUnit="bar" editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("n2", value)} />
            <RangeControl label={copy.carbon} value={simulation.co2} min={0} max={100} step={0.0001} display={formatGas(simulation.co2, "co2", locale)} hint={copy.carbonHint} inputMin={0} inputMax={MAX_ATMOSPHERIC_CO2} inputUnit="bar" editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("co2", value)} />
            <RangeControl label={copy.methane} value={config.ch4} min={0} max={10} step={0.0001} display={formatGas(config.ch4, "ch4", locale)} hint={copy.methaneHint} inputMin={0} inputMax={100} inputUnit="%" editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("ch4", value)} />
            <RangeControl label={copy.hydrogen} value={config.h2} min={0} max={50} step={0.5} display={percent(config.h2, 1)} hint={copy.hydrogenHint} inputMin={0} inputMax={100} inputUnit="%" editHint={copy.editExact} exactLabel={copy.exactValue} onChange={(value) => setParameter("h2", value)} />
          </div>
        </aside>

        <section className="center-column">
          <div className="panel planet-panel">
            <div className={`panel-heading planet-heading state-${stateSlug}`}><div><span className="eyebrow">{copy.observatory}</span><h2>{stateLabel}</h2><p>{STATE_SUMMARIES[locale][climate.state]}</p></div><span className={`state-pill ${conditionTone}`}><span>{climate.stateEmoji}</span>{transitionLabel}</span></div>
            <div
              className={`planet-stage tone-${conditionTone} state-${stateSlug}`}
              data-climate-state={climate.state}
              data-water-phase={climate.waterPhase}
              data-boiling-point-k={formatNumber(climate.boilingPoint, 2)}
            >
              <div className="star-dust" aria-hidden="true" /><div className="star" aria-hidden="true"><span /></div><div className="planet-shadow" aria-hidden="true" />
              <div className="planet-visual">
                <PlanetRenderer
                  state={climate.state}
                  ariaLabel={locale === "sk" ? `Procedurálne 3D zobrazenie planéty v stave ${stateLabel} pri teplote ${Math.round(climate.surfaceTemp)} kelvinov` : `Procedural 3D rendering of a ${stateLabel} planet at ${Math.round(climate.surfaceTemp)} kelvin`}
                  temperature={climate.surfaceTemp}
                  mass={config.mass}
                  oceanCoverage={climate.waterCoverage}
                  liquidWater={climate.liquidWater}
                  iceCoverage={climate.iceCoverage}
                  cloudCover={climate.cloudCover}
                  steamPressure={climate.steamPressure}
                  atmosphericPressure={climate.pressure}
                  haze={clamp(climate.hazeFeedback / 0.17, 0, 1)}
                  albedo={climate.albedo}
                  landFraction={config.land / 100}
                  geology={config.geology}
                  rotationPeriod={config.rotation}
                  stellarFlux={config.flux}
                />
              </div>
              <div className="render-readout"><span>{copy.render}</span><strong>{visualRegime}</strong></div>
              <div className="planet-caption"><span className="caption-dot" /><span>{copy.surfaceResponse}</span><strong>{number(climate.surfaceTemp - 273.15, 1)}°C</strong></div>
            </div>
            <div className="stat-grid">
              <div className="stat-card main-stat"><span className="stat-label">{copy.surfaceTemp}</span><strong>{number(climate.surfaceTemp, 1)} <small>K</small></strong><span className="stat-sub">{number(climate.surfaceTemp - 273.15, 1)}°C {copy.mean}</span></div>
              <div className="stat-card"><span className="stat-label">{copy.pressure}</span><strong>{number(climate.pressure, climate.pressure < 0.1 ? 3 : 2)} <small>bar</small></strong><span className="stat-sub">{percent(climate.albedo * 100, 1)} albedo</span></div>
              <div className="stat-card"><span className="stat-label">{copy.surfaceOcean}</span><strong>{number(climate.liquidWater, 2)} <small>{copy.earthOceans}</small></strong><span className="stat-sub">{surfaceWaterDetail}</span></div>
              <div className="stat-card phase-stat"><span className="stat-label">{copy.waterPhase}</span><strong>{phaseLabel}</strong><span className="stat-sub" title={phaseDetail}>{phaseDetail}</span></div>
            </div>
            <div className="charts-row">
              <div className="mini-chart"><div className="chart-header"><span>{copy.tempHistory}</span><strong>{formatYears(simulation.year, locale)}</strong></div><div className="chart-frame"><Sparkline history={simulation.history} field="temp" color="#ffb86b" /><span className="chart-axis">180 K</span><span className="chart-axis top">{number(HIGH_TEMPERATURE_MODEL_CEILING, 0)} K</span></div></div>
              <div className="mini-chart water-chart"><div className="chart-header"><span>{copy.waterLeft}</span><strong>{percent((totalWaterRemaining / Math.max(config.water, 0.001)) * 100)}</strong></div><div className="chart-frame"><Sparkline history={simulation.history} field="water" color="#70d9e6" /><span className="chart-axis">0</span><span className="chart-axis top">{number(Math.max(config.water, 1), 1)}×</span></div></div>
            </div>
          </div>

          <div className="panel timeline-panel">
            <div className="timeline-copy"><span className="eyebrow">{copy.geologicalClock}</span><strong>{formatYears(simulation.year, locale)}</strong><span>{running ? copy.running : copy.paused}</span></div>
            <div className="timeline-controls"><button type="button" className={`run-button ${running ? "is-running" : ""}`} onClick={toggleRunning}><span>{running ? "Ⅱ" : "▶"}</span>{running ? copy.pause : copy.run}</button><button type="button" className="reset-button" onClick={reset}>{copy.reset}</button><div className="speed-picker" aria-label={copy.speed}>{SPEEDS.map((option) => <button type="button" key={option.label} className={speed === option.years ? "active" : ""} onClick={() => setSpeed(option.years)}>{option.label}</button>)}</div></div>
          </div>
        </section>

        <aside className="right-column">
          <div className="panel analysis-panel">
            <div className="panel-heading"><div><span className="eyebrow">{copy.diagnostics}</span><h2>{copy.drivers}</h2></div><span className="panel-index">02</span></div>
            <div className="diagnostic-stack"><Meter label={copy.greenhouse} value={climate.greenhouseIndex / 1.2} color="amber" detail={`${number(climate.greenhouseIndex * 100, 0)} / 100`} /><Meter label={copy.iceLock} value={climate.iceFeedback / 0.3} color="ice" detail={`${percent(climate.iceCoverage * 100)} ${copy.ice}`} /><Meter label={copy.cloudShield} value={climate.cloudFeedback / 0.34} color="cyan" detail={`${percent(climate.cloudCover * 100)} ${copy.cloud}`} /><Meter label={copy.runaway} value={climate.runawayScore} color="hot" detail={percent(climate.runawayScore * 100)} /><Meter label={copy.carbonThermostat} value={climate.carbonCycleHealth} color="mint" detail={localized(CARBON_MODE_LABELS, climate.carbonCycleMode, locale)} /></div>
            <div className="critical-line"><span>{copy.radiativeTarget}</span><strong>{number(climate.equilibriumTemp, 0)} K · {number(climate.equilibriumTemp - 273.15, 0)}°C</strong></div>
            <div className="critical-line"><span>{copy.dominantOpacity}</span><strong>{localized(OPACITY_LABELS, climate.dominantOpacity, locale)}</strong></div>
            <div className={`critical-line validity-${climate.modelValidity.toLowerCase().replaceAll(" ", "-")}`}><span>{copy.modelValidity}</span><strong>{MODEL_VALIDITY_LABELS[locale][climate.modelValidity]}</strong></div>
            <div className="critical-line"><span>{copy.runawayThreshold}</span><strong>{totalWaterRemaining > 0.002 ? `${number(climate.criticalFlux, 0)} W/m²` : copy.noWaterLimit}</strong></div>
            <div className="critical-line"><span>{copy.phaseCheck}</span><strong>{phaseBoundaryLabel}</strong></div>
            <div className="critical-line"><span>{localized(PHASE_MODE_LABELS, climate.phaseMode, locale)}</span><strong>{formatReservoirTimescale(phaseReservoir, climate.phaseRate, locale)}</strong></div>
            <div className="critical-line"><span>{localized(LOSS_MODE_LABELS, climate.waterLossMode, locale)}</span><strong>{formatReservoirTimescale(totalWaterRemaining, climate.waterLossRate, locale)}</strong></div>
            <div className="critical-line"><span>{copy.carbonBalance}</span><strong>{formatBarRate(climate.carbonNetRate, locale)}</strong></div>
            <div className="carbon-budget"><span>{copy.volcanic} +{number(climate.carbonOutgassingRate * 1e9, 1)}</span><span>{copy.weathering} −{number(climate.carbonWeatheringRate * 1e9, 1)}</span><span>bar/{locale === "sk" ? "mld. r." : "Gyr"}</span></div>
            <p className="analysis-note">{describeClimate(climate, locale, phaseDetail)}</p>
          </div>

          <div className="panel state-panel"><div className="panel-heading compact-heading"><div><span className="eyebrow">{copy.stateAtlas}</span><h2>{copy.regimes}</h2></div><span className="panel-index">03</span></div><div className="state-atlas">{(["Snowball", "Icehouse", "Habitable", "Waterworld", "Hothouse", "Moist greenhouse", "Wet runaway", "Steam atmosphere", "Supercritical H₂O", "Magma ocean", "Dry runaway", "Mars-like", "Venus-like"] as ClimateState[]).map((state) => <span key={state} className={`atlas-chip ${state === climate.state ? "selected" : ""} ${STATE_META[state].tone}`}><span>{STATE_META[state].emoji}</span>{STATE_LABELS[locale][state]}</span>)}</div><div className="atlas-footnote">{copy.atlasHint}</div></div>

          <div className="panel composition-panel"><div className="panel-heading compact-heading"><div><span className="eyebrow">{copy.ledger}</span><h2>{copy.composition}</h2></div></div><div className="composition-list"><div><span className="gas-dot n2" />N₂ / {copy.background}<span>{number(config.n2, 2)} bar</span></div><div><span className="gas-dot co2" />CO₂ · {copy.evolving}<span>{formatGas(simulation.co2, "co2", locale)}</span></div><div><span className="gas-dot ch4" />CH₄<span>{formatGas(config.ch4, "ch4", locale)}</span></div><div><span className="gas-dot h2" />H₂<span>{percent(config.h2, 1)}</span></div><div><span className="gas-dot h2o" />H₂O {copy.vapor}<span>{number(climate.steamPressure, climate.steamPressure < 0.1 ? 3 : 1)} bar</span></div></div></div>
        </aside>
      </section>

      <section className="model-section" id="field-notes" ref={notesRef}>
        <button className="model-toggle" type="button" onClick={() => setShowNotes((value) => !value)} aria-expanded={showNotes} aria-controls="field-notes-content">
          <span className="eyebrow">{copy.modelNotes}</span>
          <span>{showNotes ? copy.hideNotes : copy.openNotes}</span>
        </button>
        {showNotes ? (
          <div className="model-notes" id="field-notes-content">
            <div>
              <h3>{copy.phaseTitle}</h3>
              <p>{copy.phaseNote}</p>
              <h3>{copy.correctionTitle}</h3>
              <p>{copy.correctionNote}</p>
            </div>
            <div>
              <h3>{copy.carbonTitle}</h3>
              <p>{copy.carbonNote}</p>
              <h3>{copy.highTempTitle}</h3>
              <p>{copy.highTempNote}</p>
            </div>
            <div className="references">
              <h3>{copy.anchors}</h3>
              <a href="https://doi.org/10.1029/JC086iC10p09776" target="_blank" rel="noreferrer">Walker, Hays &amp; Kasting (1981) · {locale === "sk" ? "silikátový termostat" : "silicate-weathering thermostat"} ↗</a>
              <a href="https://www.nature.com/articles/s41467-020-19896-2" target="_blank" rel="noreferrer">Lehmer et al. (2020) · {locale === "sk" ? "parametre prepojeného modelu klímy a uhlíka" : "coupled climate–carbon parameters"} ↗</a>
              <a href="https://doi.org/10.1029/2004JD005162" target="_blank" rel="noreferrer">Pierrehumbert (2005) · {locale === "sk" ? "rozmrazenie úplne zaľadnenej planéty" : "hard-Snowball deglaciation"} ↗</a>
              <a href="https://iapws.org/documents/release/IAPWS-95" target="_blank" rel="noreferrer">IAPWS-95 · {locale === "sk" ? "skupenstvá vody a krivka rovnováhy" : "water fluid phases and coexistence curve"} ↗</a>
              <a href="https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&amp;Mask=4" target="_blank" rel="noreferrer">NIST Water WebBook · {locale === "sk" ? "kritický bod a tlak pary" : "critical point and vapor pressure"} ↗</a>
              <a href="https://www.nature.com/articles/ncomms10627" target="_blank" rel="noreferrer">Popp et al. (2016) · {locale === "sk" ? "oceány vo vlhkom skleníku" : "moist-greenhouse ocean states"} ↗</a>
              <a href="https://doi.org/10.1038/s41586-023-06258-3" target="_blank" rel="noreferrer">Selsis et al. (2023) · {locale === "sk" ? "chladné parné atmosféry pri nekontrolovateľnom vlhkom skleníku" : "cool steam-runaway atmospheres"} ↗</a>
              <a href="https://doi.org/10.3847/1538-4357/ac1345" target="_blank" rel="noreferrer">Boukrouche et al. (2021) · {locale === "sk" ? "žiarenie po skleníkovom úniku" : "post-runaway radiation"} ↗</a>
              <a href="https://doi.org/10.1038/ngeo1892" target="_blank" rel="noreferrer">Goldblatt et al. (2013) · {locale === "sk" ? "radiačný limit 282 W/m² a horúca vetva" : "282 W/m² radiation limit and hot branch"} ↗</a>
              <a href="https://doi.org/10.3847/1538-4357/ab30c4" target="_blank" rel="noreferrer">Koll &amp; Cronin (2019) · {locale === "sk" ? "vplyv N₂, CO₂ a H₂ na vlhký únik" : "N₂, CO₂, and H₂ runaway behavior"} ↗</a>
              <a href="https://doi.org/10.3847/PSJ/adcd5f" target="_blank" rel="noreferrer">Cmiel, Wordsworth &amp; Seeley (2025) · {locale === "sk" ? "horúce husté atmosféry" : "hot dense atmospheres"} ↗</a>
              <a href="https://doi.org/10.1089/ast.2015.1422" target="_blank" rel="noreferrer">Arney et al. (2016) · {locale === "sk" ? "metánový zákal a antiskleníkový efekt" : "methane haze and anti-greenhouse cooling"} ↗</a>
              <a href="https://arxiv.org/abs/2309.05449" target="_blank" rel="noreferrer">Chaverot, Bolmont &amp; Turbet (2023) · {locale === "sk" ? "prechod v globálnom klimatickom modeli" : "runaway transition with a GCM"} ↗</a>
              <a href="https://science.nasa.gov/venus/venus-facts/" target="_blank" rel="noreferrer">NASA · {locale === "sk" ? "kontrolné podmienky Venuše" : "Venus benchmark conditions"} ↗</a>
              <a href="https://science.nasa.gov/mars/facts/" target="_blank" rel="noreferrer">NASA · {locale === "sk" ? "kontrolné podmienky Marsu" : "Mars benchmark conditions"} ↗</a>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="footer"><span>{copy.footerLead}</span><span>{copy.footerNote}</span></footer>
    </main>
  );
}
