export type PriceSourceId =
  | 'sekocenbud'
  | 'intercenbud'
  | 'bistyp'
  | 'orgbud'
  | 'rynek_dolnoslaski';

export type SubregionId =
  | 'wroclaw'
  | 'legnica_glogow'
  | 'walbrzych'
  | 'jelenia_gora';

export type WorkCategory =
  | 'roboty_ziemne'
  | 'rozbiorki_wyburzenia'
  | 'odwodnienie_zabezpieczenia'
  | 'podbudowy_stabilizacja'
  | 'transport_utylizacja';

export type WorkUnit = 'm³' | 'm²' | 'mb' | 'szt.' | 't' | 'm-g' | 'kpl.';

export interface RateBreakdown {
  labor: number;
  materials: number;
  equipment: number;
}

export interface PriceSourceMeta {
  id: PriceSourceId;
  name: string;
  shortName: string;
  quarter: string;
  description: string;
  hourlyLaborAvg: number;
  equipmentIndex: number;
}

export interface SubregionMeta {
  id: SubregionId;
  name: string;
  cities: string;
  multiplier: number;
  disposalFeeNote: string;
}

export type CountyBenchmarkId =
  | 'm_wroclaw'
  | 'pow_wroclawski'
  | 'pow_lubinski'
  | 'pow_legnicki'
  | 'pow_boleslawiecki'
  | 'pow_lwowecki'
  | 'pow_zlotoryjski'
  | 'pow_swidnicki'
  | 'pow_walbrzyski'
  | 'pow_karkonoski';

export interface CountyMarginBenchmark {
  id: CountyBenchmarkId;
  name: string;
  shortName: string;
  subregionId: SubregionId;
  avgMarginPct: number;
  typicalRangeMinPct: number;
  typicalRangeMaxPct: number;
  marketNote: string;
}

export interface HistoricalRatePoint {
  monthKey: string;
  monthLabel: string;
  isForecast: boolean;
  laborRatePln: number | null;
  equipmentRatePln: number | null;
  laborForecastPln: number | null;
  equipmentForecastPln: number | null;
  laborIndex: number | null;
  equipmentIndex: number | null;
  laborForecastIndex: number | null;
  equipmentForecastIndex: number | null;
}

export interface RegionalRateTrendProfile {
  subregionId: SubregionId;
  months: string[];
  monthLabels: string[];
  laborRelIndices: number[];
  equipmentRelIndices: number[];
  driverNote: string;
}

export type EarthworkRiskLevel = 'niskie' | 'umiarkowane' | 'wysokie' | 'krytyczne';

export interface RegionalClimateProfile {
  subregionId: SubregionId;
  precipitationMm: number[]; // 12 miesięcy (Sty–Gru)
  frostThawIndices: number[]; // Sezonowy wpływ mrozu, roztopów i nawodnienia gruntu (0–30)
  climateNote: string;
}

export interface SeasonalEarthworkRiskPoint {
  monthIndex: number; // 0..11
  monthShort: string;
  monthFull: string;
  precipitationMm: number;
  delayRiskPct: number;
  riskLevel: EarthworkRiskLevel;
  riskLabel: string;
  suggestedCostBufferPct: number;
  suggestedScheduleBufferDays: number;
  reasonNote: string;
}

export interface EarthworksSeasonalityReport {
  subregionId: SubregionId;
  subregionName: string;
  soilCategory: SoilCategory;
  plannedMonthIndex: number;
  months: SeasonalEarthworkRiskPoint[];
  selectedMonth: SeasonalEarthworkRiskPoint;
  peakRiskMonth: SeasonalEarthworkRiskPoint;
  optimalMonth: SeasonalEarthworkRiskPoint;
  annualPrecipitationMm: number;
  avgDelayRiskPct: number;
  bufferBasePln: number;
  isEarthworksSubsetBase: boolean;
  selectedMonthBufferPln: number;
  peakMonthBufferPln: number;
  optimalMonthBufferPln: number;
  soilAdvice: string;
  regionalClimateNote: string;
}

export interface CatalogWorkItem {
  id: string;
  knr: string;
  name: string;
  category: WorkCategory;
  unit: WorkUnit;
  bdoCode?: string;
  description: string;
  ratesBySource: Record<PriceSourceId, RateBreakdown>;
}

export interface EstimateLineItem {
  id: string;
  catalogId?: string;
  knr: string;
  name: string;
  category: WorkCategory;
  unit: WorkUnit;
  quantity: number;
  rateLabor: number;
  rateMaterials: number;
  rateEquipment: number;
  bdoCode?: string;
  notes?: string;
  isCustom?: boolean;
}

export interface EstimateSettings {
  sourceId: PriceSourceId;
  subregionId: SubregionId;
  indirectCostsPct: number; // Koszty pośrednie (Kp) %
  profitPct: number;        // Zysk (Z) %
  vatRate: 8 | 23;
  discountPct: number;      // Rabat handlowy %
  soilRiskPct?: number;     // Współczynnik ryzyka gruntowego i kolizji podziemnych (%)
}

export type StructureObjectType =
  | 'budynek_murowany'
  | 'hala_stalowa'
  | 'obiekt_zelbetowy'
  | 'budowla_ziemna';

export type WorkScopeMode =
  | 'kompleksowo'
  | 'tylko_ziemne'
  | 'tylko_rozbiorka';

export type SoilCategory = 'I-II' | 'III' | 'IV';

export interface StructureParams {
  projectName: string;
  objectType: StructureObjectType;
  scopeMode: WorkScopeMode;
  lengthM: number;
  widthM: number;
  heightM: number;
  floors: number;
  basementDepthM: number;
  wallThicknessCm: number;
  excavationDepthM: number;
  overdigMarginM: number;
  soilCategory: SoilCategory;
  haulDistanceKm: number;
  groundwaterLowering: boolean;
  shoringRequired: boolean;
  hasAsbestosRoof: boolean;
  treesToRemove: number;
}

export interface StructureVolumePreview {
  footprintM2: number;
  grossVolumeM3: number;
  topsoilVolumeM3: number;
  excavationVolumeM3: number;
  backfillVolumeM3: number;
  brickRubbleTonnes: number;
  concreteRubbleTonnes: number;
  steelScrapTonnes: number;
  asbestosM2: number;
}

export interface LineTotals {
  laborTotal: number;
  materialsTotal: number;
  equipmentTotal: number;
  directTotal: number;
  indirectCost: number;
  profit: number;
  riskReserveAmount?: number;
  netBeforeDiscount: number;
  discountAmount: number;
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
  unitNetRate: number;
}

export interface CategorySummary {
  category: WorkCategory;
  label: string;
  laborTotal: number;
  materialsTotal: number;
  equipmentTotal: number;
  netTotal: number;
  itemCount: number;
}

export interface EstimateSummary {
  laborTotal: number;
  materialsTotal: number;
  equipmentTotal: number;
  directTotal: number;
  indirectCost: number;
  profit: number;
  riskReserveAmount?: number;
  discountAmount: number;
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
  laborSharePct: number;
  materialsSharePct: number;
  equipmentSharePct: number;
  byCategory: CategorySummary[];
  bdoSummary: { code: string; quantity: number; unit: WorkUnit; items: string[] }[];
}

export interface SourceComparisonRow {
  sourceId: PriceSourceId;
  sourceName: string;
  shortName: string;
  laborTotal: number;
  materialsTotal: number;
  equipmentTotal: number;
  netTotal: number;
  grossTotal: number;
  deltaFromActivePct: number;
  deltaFromActivePln: number;
}

export interface OfferMetadata {
  offerNumber: string;
  issueDate: string;
  validUntil: string;
  contractorName: string;
  contractorNip: string;
  contractorAddress: string;
  contractorPhone: string;
  contractorEmail: string;
  clientName: string;
  clientNip: string;
  clientAddress: string;
  projectLocation: string;
  executionTimeline: string;
  paymentTerms: string;
  warrantyMonths: number;
  exclusions: string;
  additionalNotes: string;
}

export interface AiAnalysisExtractedItem {
  catalogId?: string;
  knr: string;
  name: string;
  category: WorkCategory;
  unit: WorkUnit;
  quantity: number;
  bdoCode?: string;
  reasoning: string;
}

export interface AiDocAnalysisResult {
  projectTitle: string;
  detectedLocation: string;
  summary: string;
  recommendedSubregion: SubregionId;
  estimatedDimensions: {
    lengthM: number;
    widthM: number;
    heightM: number;
    floors: number;
    excavationDepthM: number;
    soilCategory: SoilCategory;
  };
  detectedBdoCodes: string[];
  risksAndAssumptions: string[];
  items: AiAnalysisExtractedItem[];
}

export interface SampleDocPreset {
  id: string;
  title: string;
  subregion: SubregionId;
  location: string;
  content: string;
}

export type QuarryId =
  | 'wojciechow'
  | 'czaple'
  | 'strzegom'
  | 'mietkow'
  | 'grzedy'
  | 'materialy_inz'
  | 'lokalna_wyszukana';

export interface QuarryMeta {
  id: QuarryId;
  name: string;
  shortName: string;
  locality: string;
  rockTypes: string;
  notes: string;
}

export interface QuarryMaterialItem {
  id: string;
  quarryId: QuarryId;
  name: string;
  fraction: string;
  rockType: string;
  unit: WorkUnit;
  bulkDensityTPerM3?: number;
  priceNetPerUnit: number;
  category: WorkCategory;
  description: string;
  isCustom?: boolean;
  customQuarryName?: string;
  customLocality?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface QuarrySearchSource {
  title: string;
  uri: string;
}

export interface QuarrySearchCandidate {
  id: string;
  quarryName: string;
  locality: string;
  name: string;
  fraction: string;
  rockType: string;
  unit: WorkUnit;
  bulkDensityTPerM3?: number;
  priceNetPerUnit: number | null;
  priceConfidence: 'verified' | 'estimated' | 'missing';
  priceNote: string;
  category: WorkCategory;
  description: string;
}

export interface QuarrySearchResponse {
  query: string;
  summary: string;
  quarryOfficialName: string;
  locality: string;
  items: QuarrySearchCandidate[];
  sources: QuarrySearchSource[];
  webSearchQueries: string[];
}

export type TenderScopeFilter = 'all' | 'works' | 'earthworks_demolition';

export type RegionalTenderBucket =
  | 'all'
  | 'lwowek'
  | 'boleslawiec'
  | 'zlotoryja'
  | 'wody_polskie'
  | 'kowr'
  | 'other';

export type TenderWorkProfile =
  | 'rozbiorka'
  | 'drogi_nawierzchnie'
  | 'roboty_ziemne'
  | 'wodne_melioracje'
  | 'sieci_wykopy'
  | 'kruszywa'
  | 'wycinka_teren'
  | 'ogolnobudowlane';

export interface TenderDetectedQuantity {
  value: number;
  unit: 'km' | 'mb' | 'm²' | 'ha' | 'm³' | 't' | 'szt.';
  normalizedLabel: string;
  context: string;
}

export interface TenderExtractedData {
  referenceNumber?: string;
  organizationNip?: string;
  organizationRegon?: string;
  organizationStreet?: string;
  organizationPostalCode?: string;
  executionPeriod?: string;
  warrantyMonths?: number;
  wadiumPln?: number;
  experienceValuePln?: number;
  experienceAreaM2?: number;
  fullDescription: string;
  detectedWorkProfile: TenderWorkProfile;
  detectedQuantities: TenderDetectedQuantity[];
  externalPageTitle?: string;
  externalPageExcerpt?: string;
  externalDocLinks?: { label: string; url: string }[];
}

export interface TenderAutoEstimate {
  tenderId: string;
  noticeNumber: string;
  calculatedAt: string;
  calculationMethod: 'bzp_auto' | 'bzp_plus_portal' | 'ai_refined';
  confidence: 'wysoka' | 'srednia' | 'wstepna';
  confidenceNote: string;
  scaleBasis: string;
  workProfileLabel: string;
  extracted: TenderExtractedData;
  items: EstimateLineItem[];
  suggestedOfferPatch: Partial<OfferMetadata>;
  suggestedStructurePatch?: Partial<StructureParams>;
  summary: EstimateSummary;
}

export interface DolnoslaskieTenderItem {
  id: string;
  tenderId: string;
  noticeNumber: string;
  bzpNumber: string;
  orderType: string;
  orderObject: string;
  organizationName: string;
  organizationCity: string;
  organizationProvince: string;
  subregionId: SubregionId;
  nuts3Label: string;
  regionalBucket?: Exclude<RegionalTenderBucket, 'all'>;
  cpvCode: string;
  publicationDate: string;
  submittingOffersDate: string | null;
  isActiveDeadline: boolean;
  isEarthworksOrDemolition: boolean;
  shortDescription: string;
  procedureUrl: string;
  ezamowieniaUrl: string;
  organizationEmail?: string;
  extractedData?: TenderExtractedData;
}

export interface DolnoslaskieTendersResponse {
  fetchedAt: string;
  provinceCode: 'PL02';
  provinceName: string;
  daysBack: number;
  totalFetched: number;
  items: DolnoslaskieTenderItem[];
}

export type LocalBipRegionId =
  | 'powiat_lwowecki'
  | 'powiat_boleslawiecki'
  | 'powiat_zlotoryjski'
  | 'wody_polskie_lwowek'
  | 'kowr_dolny_slask'
  | 'inne_instytucje';

export interface LocalBipTenderCandidate {
  id: string;
  regionId: LocalBipRegionId;
  title: string;
  institution: string;
  locality: string;
  sourcePlatform: string;
  referenceNumber: string;
  publishedDate: string;
  deadlineDate: string;
  statusLabel: 'aktualny' | 'archiwalny' | 'nieznany';
  isEarthworksOrDemolition: boolean;
  summary: string;
  url: string;
}

export interface LocalBipSearchResponse {
  regionId: LocalBipRegionId;
  query: string;
  searchedAt: string;
  overview: string;
  items: LocalBipTenderCandidate[];
  sources: QuarrySearchSource[];
  webSearchQueries: string[];
}

export interface LocalBipPortalLink {
  id: string;
  regionId: LocalBipRegionId;
  name: string;
  category: string;
  url: string;
}

export interface PersistedPriceSourceMeta extends PriceSourceMeta {
  updatedAt?: string;
  isCustom?: boolean;
}

export interface PersistedSubregionMeta extends SubregionMeta {
  updatedAt?: string;
}

export interface PersistedCatalogWorkItem extends CatalogWorkItem {
  updatedAt?: string;
  isCustom?: boolean;
  isModifiedByUser?: boolean;
}

export interface PersistedQuarryMaterialItem extends QuarryMaterialItem {
  updatedAt?: string;
  isModifiedByUser?: boolean;
}

export type EntitySyncStatus = 'local_only' | 'pending_sync' | 'synced' | 'conflict';

export interface SavedProjectEstimate {
  id: string;
  projectKey?: string;
  name: string;
  versionNumber?: number;
  versionTag?: string;
  versionNote?: string;
  clientName?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  netTotal: number;
  items: EstimateLineItem[];
  settings: EstimateSettings;
  structureParams: StructureParams;
  offer: OfferMetadata;
  syncStatus?: EntitySyncStatus;
  localRevision?: number;
  cloudRevision?: number;
  lastSyncedAt?: string | null;
  deleted?: boolean;
}

export interface CompanyProfile {
  companyName: string;
  companyNip: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  updatedAt?: string;
}

export type LocalSubfolderKey =
  | 'Kosztorysy'
  | 'Oferty PDF'
  | 'Bazy cenowe'
  | 'Dane firmy'
  | 'Kopie zapasowe'
  | 'Eksport Excel';

export interface LocalSubfolderInfo {
  name: LocalSubfolderKey;
  path: string;
  exists: boolean;
  fileCount: number;
}

export interface LocalStorageStatus {
  runtimeMode: 'tauri_desktop' | 'local_node_sqlite';
  platform: string;
  appFolderName: string;
  documentsBaseDir: string;
  documentsRootPath: string;
  appDataDirPath: string;
  sqliteDbPath: string;
  sqliteJournalMode: string;
  sqliteSynchronous: string;
  ownerOnlySecured: boolean;
  noPlaintextSecrets: boolean;
  autoBackupEnabled: boolean;
  autoBackupIntervalMinutes: number;
  lastAutoBackupAt: string | null;
  subfolders: LocalSubfolderInfo[];
  projectCount: number;
  estimateItemCount: number;
  customRateCount: number;
  backupCount: number;
  pendingSyncCount: number;
}

export interface LocalBackupEntry {
  id: string;
  label: string;
  backupType: 'manual' | 'auto' | 'pre_sync' | 'pre_restore';
  jsonFilename: string;
  dbFilename: string | null;
  projectCount: number;
  itemCount: number;
  sizeBytes: number;
  createdAt: string;
}

export interface ChangeHistoryRecord {
  id: string;
  entityType: 'estimate' | 'price_list' | 'settings' | 'backup' | 'sync';
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface SyncConflictItem {
  id: string;
  entityType: 'estimate' | 'settings';
  title: string;
  localUpdatedAt: string;
  cloudUpdatedAt: string;
  localRevision: number;
  cloudRevision: number;
  localItemCount?: number;
  cloudItemCount?: number;
  localNetTotal?: number;
  cloudNetTotal?: number;
  localSnapshot?: SavedProjectEstimate;
  cloudSnapshot?: SavedProjectEstimate;
}

export type CloudConflictResolutionChoice = 'keep_local' | 'accept_cloud' | 'keep_both';

export interface CloudSyncDiagnosticReport {
  checkedAt: string;
  networkOnline: boolean;
  firebaseReachable: boolean;
  authenticated: boolean;
  userEmail: string | null;
  emailVerified: boolean;
  pendingLocalCount: number;
  conflictCount: number;
  cloudEstimateCount: number | null;
  statusMessage: string;
}

export interface ExternalWorkRateUpdate {
  id: string;
  knr?: string;
  name?: string;
  category?: WorkCategory;
  unit?: WorkUnit;
  description?: string;
  bdoCode?: string;
  ratesBySource: Record<PriceSourceId, RateBreakdown>;
}

export interface ExternalQuarryRateUpdate {
  id: string;
  priceNetPerUnit: number;
  name?: string;
  fraction?: string;
  description?: string;
  quarryId?: QuarryId;
  rockType?: string;
  unit?: WorkUnit;
  category?: WorkCategory;
  bulkDensityTPerM3?: number;
}

export interface ExternalPriceListPackage {
  version: string;
  publishedAt: string;
  quarter: string;
  publisher: string;
  changelog: string[];
  priceSources?: Partial<Record<PriceSourceId, Partial<PriceSourceMeta>>>;
  subregions?: Partial<Record<SubregionId, Partial<SubregionMeta>>>;
  workCatalogUpdates?: ExternalWorkRateUpdate[];
  quarryMaterialUpdates?: ExternalQuarryRateUpdate[];
}

export type SyncConflictStrategy = 'preserve_custom' | 'overwrite_all';

export interface PendingSyncImport {
  id: string;
  queuedAt: string;
  sourceType: 'remote_feed' | 'external_file';
  label: string;
  conflictStrategy: SyncConflictStrategy;
  packageData?: ExternalPriceListPackage;
}

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  sourceType: 'remote_feed' | 'external_file' | 'queued_flush';
  version: string;
  status: 'synced' | 'deferred_offline' | 'error';
  updatedWorkCount: number;
  updatedSourceCount: number;
  updatedQuarryCount: number;
  skippedCustomCount: number;
  message: string;
}

export interface SyncStatusState {
  currentVersion: string;
  lastSyncedAt: string | null;
  lastResultStatus: 'idle' | 'synced' | 'deferred_offline' | 'error';
  lastResultMessage: string | null;
}

export type DieselPriceBenchmarkMode = 'retail_pl' | 'wholesale_orlen';

export interface DieselMonthlyPriceItem {
  monthKey: string;
  monthLabel: string;
  pricePlnPerL: number;
}

export interface DieselGoogleSearchResponse {
  benchmarkMode: DieselPriceBenchmarkMode;
  fetchedAt: string;
  summary: string;
  fuelStationReference: string;
  monthlyPrices: DieselMonthlyPriceItem[];
  sources: QuarrySearchSource[];
  webSearchQueries: string[];
}

export interface DieselHistoryPoint {
  monthKey: string;
  monthLabel: string;
  dieselPlnPerL: number;
  equipmentRatePln: number;
  estimateEquipmentCostPln: number;
  dieselIndex: number;
  equipmentIndex: number;
}

export interface DieselEquipmentCorrelationReport {
  subregionId: SubregionId;
  subregionName: string;
  sourceId: PriceSourceId;
  sourceShortName: string;
  benchmarkMode: DieselPriceBenchmarkMode;
  dieselDataOrigin: 'google_search' | 'reference_baseline';
  points: DieselHistoryPoint[];
  pearsonCorrelation: number;
  correlationStrengthLabel: string;
  fuelPassThroughElasticityPct: number;
  currentDieselPlnPerL: number;
  startDieselPlnPerL: number;
  minDieselPlnPerL: number;
  maxDieselPlnPerL: number;
  dieselChange12mPct: number;
  currentEquipmentRatePln: number;
  equipmentChange12mPct: number;
  activeEstimateEquipmentPln: number;
  scenarioDieselDeltaPln: number;
  scenarioDieselPlnPerL: number;
  scenarioEquipmentRatePln: number;
  scenarioEquipmentDeltaPct: number;
  scenarioEstimateEquipmentDeltaPln: number;
  scenarioEstimateNetDeltaPln: number;
  negotiationTalkingPoint: string;
}

export type ItemProfitabilitySortMode =
  | 'estimate_order'
  | 'margin_asc'
  | 'margin_desc'
  | 'profit_desc';

export interface ItemProfitabilityCountyDelta {
  countyId: CountyBenchmarkId;
  countyShortName: string;
  countyFullName: string;
  countyMarginPct: number;
  equivalentProfitPln: number;
  deltaPp: number;
  deltaPln: number;
}

export interface ItemProfitabilityBar {
  id: string;
  lp: number;
  knrCode: string;
  shortLabel: string;
  fullName: string;
  category: WorkCategory;
  categoryLabel: string;
  quantity: number;
  unit: EstimateLineItem['unit'];
  netTotal: number;
  executionCostPln: number;
  profitPln: number;
  marginPct: number;
  materialsSharePct: number;
  selectedMetricValue: number;
  benchmarkMetricValue: number;
  benchmarkMarginPct: number;
  benchmarkProfitPln: number;
  deltaVsBenchmarkPp: number;
  deltaVsBenchmarkPln: number;
  status: 'above_market' | 'below_market' | 'unprofitable';
  countyDeltas: ItemProfitabilityCountyDelta[];
}

export interface ItemProfitabilityCountyReport {
  bars: ItemProfitabilityBar[];
  totalEstimateItemsCount: number;
  filteredItemsCount: number;
  benchmarkMode: 'selected_avg' | 'single_county';
  benchmarkLabel: string;
  benchmarkMarginPct: number;
  selectedCountiesCount: number;
  selectedCountiesAvgMarginPct: number;
  selectedCountiesMinMarginPct: number;
  selectedCountiesMaxMarginPct: number;
  avgItemMarginPct: number;
  weightedEstimateMarginPct: number;
  aboveBenchmarkCount: number;
  belowBenchmarkCount: number;
  unprofitableCount: number;
  mostProfitableItem: ItemProfitabilityBar | null;
  lowestMarginItem: ItemProfitabilityBar | null;
}

export interface GeneratedPdfOfferRecord {
  offerNumber: string;
  projectName: string;
  projectLocation: string;
  subregionId: SubregionId;
  netTotal: number;
  grossTotal: number;
  filename: string;
  generatedAt: string;
}

export type OfferMarketSegment = 'all' | 'public_tender' | 'commercial';

export type OfferCompetitivenessMetricMode = 'net_pln' | 'index_100';

export type OfferCompetitivenessStatus =
  | 'bardzo_konkurencyjna'
  | 'optymalna_rynkowa'
  | 'powyzej_sredniej'
  | 'wysoka_ryzyko_odrzucenia';

export interface OfferCompetitivenessBar {
  id:
    | 'our_offer'
    | 'county_p25'
    | 'county_tender_median'
    | 'county_avg'
    | 'county_catalog_ref'
    | 'county_p75';
  shortLabel: string;
  fullLabel: string;
  kind: 'our_offer' | 'market';
  netPricePln: number;
  indexVsCountyAvg: number;
  selectedMetricValue: number;
  deltaVsOurOfferPln: number;
  deltaVsOurOfferPct: number;
  deltaVsCountyAvgPct: number;
  description: string;
}

export interface OfferCompetitivenessReport {
  countyId: CountyBenchmarkId;
  countyName: string;
  countyShortName: string;
  countySubregionName: string;
  countyMarketNote: string;
  segment: OfferMarketSegment;
  metricMode: OfferCompetitivenessMetricMode;
  offerSource: 'generated_pdf' | 'live_preview';
  offerNumber: string;
  offerNetTotal: number;
  countyAverageNetPln: number;
  countyMedianTenderNetPln: number;
  countyLowQuartileNetPln: number;
  countyHighQuartileNetPln: number;
  deltaVsCountyAvgPln: number;
  deltaVsCountyAvgPct: number;
  competitivenessStatus: OfferCompetitivenessStatus;
  competitivenessLabel: string;
  competitivenessAdvice: string;
  typicalCountyMarginRange: string;
  bars: OfferCompetitivenessBar[];
}

export interface WhatIfSimulationParams {
  equipmentEfficiencyDeltaPct: number; // +10 => 10% wyższa wydajność sprzętu (niższy koszt S)
  laborEfficiencyDeltaPct: number;     // +10 => 10% wyższa wydajność brygad (niższy koszt R)
  materialsPriceDeltaPct: number;      // +10 => 10% droższe materiały i opłaty BDO (wyższy koszt M)
  indirectCostsPct: number;            // Docelowe Kp (%)
  profitPct: number;                   // Docelowy Zysk (%)
  discountPct: number;                 // Docelowy Rabat (%)
}

export interface WhatIfComponentDelta {
  key: 'labor' | 'materials' | 'equipment' | 'markups' | 'discount';
  label: string;
  baselinePln: number;
  simulatedPln: number;
  deltaPln: number;
  deltaPct: number;
}

export interface WhatIfCategoryImpact {
  category: WorkCategory;
  label: string;
  baselineNetPln: number;
  simulatedNetPln: number;
  deltaNetPln: number;
  deltaNetPct: number;
}

export interface WhatIfSensitivityReport {
  baselineSummary: EstimateSummary;
  simulatedSummary: EstimateSummary;
  baselineNetTotal: number;
  simulatedNetTotal: number;
  deltaNetPln: number;
  deltaNetPct: number;
  baselineGrossTotal: number;
  simulatedGrossTotal: number;
  deltaGrossPln: number;
  baselineMarginPct: number;
  simulatedMarginPct: number;
  deltaMarginPp: number;
  equipmentCostMultiplier: number;
  laborCostMultiplier: number;
  materialsCostMultiplier: number;
  hasAnyChange: boolean;
  hasMarkupChange: boolean;
  componentDeltas: WhatIfComponentDelta[];
  categoryImpacts: WhatIfCategoryImpact[];
}

export type SiteUtilityDensity =
  | 'teren_zurbanizowany'
  | 'strefa_przemyslowa'
  | 'teren_otwarty';

export type SoilRiskSeverity = 'niskie' | 'umiarkowane' | 'wysokie' | 'krytyczne';

export interface SoilRiskDriverItem {
  id:
    | 'underground_utilities'
    | 'slope_instability'
    | 'boulders_breaker'
    | 'groundwater_seepage';
  label: string;
  contributionPct: number;
  severity: SoilRiskSeverity;
  severityLabel: string;
  engineeringNote: string;
}

export interface SoilRiskAnalysisResult {
  soilCategory: SoilCategory;
  soilTitle: string;
  soilEngineeringSummary: string;
  siteContext: SiteUtilityDensity;
  suggestedRiskPct: number;
  suggestedMultiplier: number;
  riskLevel: SoilRiskSeverity;
  riskLevelLabel: string;
  drivers: SoilRiskDriverItem[];
  mitigationChecklist: string[];
  activeEstimateBaseNetPln: number;
  activeEstimateSuggestedNetPln: number;
  activeEstimateDeltaPln: number;
  parametricEstimateBaseNetPln: number;
  parametricEstimateSuggestedNetPln: number;
  parametricEstimateDeltaPln: number;
}


