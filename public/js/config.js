export const GCF = "https://polyworld-2f581.web.app/api";
export const ENDPOINTS = {
  getFlameById: `${GCF}/getFlameById`,
  getPoliBalance: `${GCF}/getPoliBalance`,
  getUsdtBalance: `${GCF}/getUsdtBalance`,
  getPolistarBalance: `${GCF}/getPolistarBalance`,
  chatHandler: `${GCF}/chatHandler`,
  authenticateMetamask: `${GCF}/authenticateMetamask`,
  mergeUserSessions: `${GCF}/mergeUserSessions`,
  rewardPolistar: `${GCF}/rewardPolistar`,
  getPoliRate: `${GCF}/getPoliRate`,
  buyPoli: `${GCF}/buyPoliFromUsdt`,
  buildApproveUsdtTx: `${GCF}/buildApproveUsdtTx`,
  bridgeToken: `${GCF}/bridgeToken`,
  transferPolistar: `${GCF}/transferPolistar`,
  burnToken: `${GCF}/burnToken`,
  createEmberAgent: `${GCF}/createEmberAgent`,
  updateEmberVoice: `${GCF}/updateEmberVoice`,
  uploadAvatar: `${GCF}/uploadAvatar`,
  updateEmberIdentity: `${GCF}/updateEmberIdentity`,
  uploadEmberDescription: `${GCF}/uploadEmberDescription`,
  updateEmberWallet: `${GCF}/updateEmberWallet`,
  updateEmberPersona: `${GCF}/updateEmberPersona`,
  mintEmberNFT: `${GCF}/mintEmberNFT`,
  finalizeEmberTraining: `${GCF}/finalizeEmberTraining`,
};

export const DEV = {
  POLI_PER_USDT: 10, // fallback rate (1 USDT => 10 POLI, change as you like)
  SIMULATE_BUY_POLI: false, // simulate success if no endpoint / CORS fails
  SIMULATE_TRANSFER_POLISTAR: false,
};
