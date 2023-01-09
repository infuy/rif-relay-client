import type { HttpClient } from './api/common';
import { BigNumberish, BigNumber, Transaction } from 'ethers';
import { BigNumber as BigNumberJs } from 'bignumber.js';
import { RelayHub__factory } from '@rsksmart/rif-relay-contracts';
import log from 'loglevel';
import { getEnvelopingConfig, getProvider, isDeployTransaction } from './common';
import type { RequestConfig, EnvelopingTxRequest, DeployRequest, RelayRequest, RelayInfo } from './common';


const INTERNAL_TRANSACTION_ESTIMATED_CORRECTION = 20000; // When estimating the gas an internal call is going to spend, we need to substract some gas inherent to send the parameters to the blockchain
const ESTIMATED_GAS_CORRECTION_FACTOR = 1;


const selectNextRelay = async (
  httpClient: HttpClient
): Promise<RelayInfo | undefined> => {
  const { preferredRelays } = getEnvelopingConfig();

  for (const preferredRelay of preferredRelays ?? []) {
    let hubInfo;
    let managerData;

    try {
      hubInfo = await httpClient.getChainInfo(preferredRelay);
      const relayHub = RelayHub__factory.connect(hubInfo.relayHubAddress, getProvider());
      managerData = await relayHub.getRelayInfo(hubInfo.relayManagerAddress);
    } catch (error) {
      log.warn('Failed to getChainInfo from hub', error);
      continue;
    }

    if (hubInfo.ready) {
      return {
        hubInfo,
        managerData,
      };
    }
  }

  log.error('No more hubs available to select');

  return undefined;
};

// The INTERNAL_TRANSACTION_ESTIMATE_CORRECTION is substracted because the estimation is done using web3.eth.estimateGas which
// estimates the call as if it where an external call, and in our case it will be called internally (it's not the same cost).
// Because of this, the estimated maxPossibleGas in the server (which estimates the whole transaction) might not be enough to successfully pass
// the following verification made in the SmartWallet:
// require(gasleft() > req.gas, "Not enough gas left"). This is done right before calling the destination internally
const applyGasCorrectionFactor = (
  estimation: BigNumberish,
  esimatedGasCorrectFactor: BigNumberish = ESTIMATED_GAS_CORRECTION_FACTOR
): BigNumber => {
  if (esimatedGasCorrectFactor.toString() !== '1') {
    const bigGasCorrection = BigNumberJs(esimatedGasCorrectFactor.toString());
    let bigEstimation = BigNumberJs(estimation.toString());
    bigEstimation = bigEstimation.multipliedBy(bigGasCorrection);

    return BigNumber.from(bigEstimation.toFixed());
  }

  return BigNumber.from(estimation);
};

const applyInternalEstimationCorrection = (
  estimation: BigNumberish,
  internalTransactionEstimationCorrection: BigNumberish = INTERNAL_TRANSACTION_ESTIMATED_CORRECTION
) => {
  const estimationBN = BigNumber.from(estimation);

  if (estimationBN.gt(internalTransactionEstimationCorrection)) {
    return estimationBN.sub(internalTransactionEstimationCorrection);
  }

  return estimationBN;
};

/**
   * Decode the signed transaction returned from the Relay Server, compare it to the
   * requested transaction and validate its signature.
   */
const validateRelayResponse = (
  request: EnvelopingTxRequest,
  transaction: Transaction,
  relayWorkerAddress: string,
): void => {
  const {
    to: txDestination,
    from: txOrigin,
    nonce: txNonce,
    data: txData,
  } = transaction;
  const {
    metadata: { signature, relayMaxNonce },
    relayRequest,
  } = request;
  const requestMaxNonce = BigNumber.from(relayMaxNonce).toNumber();
  log.debug('validateRelayResponse - Transaction is', transaction);

  if (!txDestination) {
    throw Error('Transaction has no recipient address');
  }

  if (!txOrigin) {
    throw Error('Transaction has no signer');
  }

  const isDeploy = isDeployTransaction(request);

  const provider = getProvider();
  const envelopingConfig = getEnvelopingConfig();

  const relayHub = RelayHub__factory.connect(envelopingConfig.relayHubAddress, provider);

  const encodedEnveloping = isDeploy ?
    relayHub.interface.encodeFunctionData('deployCall', [relayRequest as DeployRequest, signature])
    : relayHub.interface.encodeFunctionData('relayCall', [relayRequest as RelayRequest, signature]);


  if (txNonce > requestMaxNonce) {
    // TODO: need to validate that client retries the same request and doesn't double-spend.
    // Note that this transaction is totally valid from the EVM's point of view
    throw new Error(
      `Relay used a tx nonce higher than requested. Requested ${requestMaxNonce} got ${txNonce}`
    );
  }

  if (
    txDestination.toLowerCase() !== envelopingConfig.relayHubAddress.toLowerCase()
  ) {
    throw new Error('Transaction recipient must be the RelayHubAddress');
  }

  if (encodedEnveloping !== txData) {
    throw new Error(
      'Relay request Encoded data must be the same as Transaction data'
    );
  }

  if (relayWorkerAddress.toLowerCase() !== txOrigin.toLowerCase()) {
    throw new Error(
      'Transaction sender address must be the same as configured relayWorker address'
    );
  }

  log.info('validateRelayResponse - valid transaction response');
}


const useEnveloping = (
  method: string,
  params: Array<Record<string, unknown>>
): boolean => {
  if (method === 'eth_accounts') {
    return true;
  }

  const [a] = params;

  if (!a) {
    return false;
  }

  const { envelopingTx, requestConfig } = a;
  if (
    envelopingTx &&
    requestConfig &&
    (requestConfig as RequestConfig).useEnveloping
  ) {
    return true;
  }

  return false;
};

export {
  selectNextRelay,
  applyGasCorrectionFactor,
  applyInternalEstimationCorrection,
  INTERNAL_TRANSACTION_ESTIMATED_CORRECTION,
  ESTIMATED_GAS_CORRECTION_FACTOR,
  validateRelayResponse,
  useEnveloping
};
