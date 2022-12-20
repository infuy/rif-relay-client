import { BigNumber, utils } from 'ethers';
import { isDeployRequest } from '../common/relayRequest.utils';
import type { EnvelopingTxRequest } from '../common/relayTransaction.types';
import RelayClient from '../RelayClient';
import {
  standardMaxPossibleGasEstimation,
  linearFitMaxPossibleGasEstimation,
} from './utils';

const estimateRelayMaxPossibleGas = async (
  request: EnvelopingTxRequest,
  relayWorkerAddress: string
): Promise<BigNumber> => {
  const {
    relayRequest,
    metadata: { signature },
  } = request;

  const { tokenContract } = relayRequest.request;
  const { feesReceiver, callForwarder, gasPrice } = relayRequest.relayData;

  const relayClient = new RelayClient();

  const isSmartWalletDeploy = isDeployRequest(relayRequest);

  //FIXME validate how to generate the smart wallet address
  const preDeploySWAddress = isSmartWalletDeploy ? undefined : undefined;

  const tokenEstimation = await relayClient.estimateTokenTransferGas({
    tokenContract,
    tokenAmount: utils.formatUnits(1, 'wei'),// tokenAmount should be a value different from zero to simulate the transfer estimation
    feesReceiver,
    isSmartWalletDeploy,
    preDeploySWAddress,
    callForwarder,
    gasPrice,
  });

  if (signature > '0x0') {
    return await standardMaxPossibleGasEstimation(
      request,
      relayWorkerAddress,
      tokenEstimation
    );
  }

  return await linearFitMaxPossibleGasEstimation(relayRequest, tokenEstimation);
};

export { estimateRelayMaxPossibleGas };