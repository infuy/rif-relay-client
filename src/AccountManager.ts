import { providers, Wallet, utils } from 'ethers';
import { getAddress, _TypedDataEncoder } from 'ethers/lib/utils';
import { isDeployRequest } from './common';
import type {
  EnvelopingRequest
} from './common';
import {
  deployRequestType,
  EnvelopingMessageTypes,
  getEnvelopingRequestDataV4Field,
  relayRequestType,
  TypedMessage,
} from './typedRequestData.utils';

export default class AccountManager {
  private _provider: providers.Provider;

  private _accounts: Wallet[] = [];

  chainId: number;

  constructor(provider: providers.Provider, chainId: number) {
    this._provider = provider;
    this.chainId = chainId;
  }

  getAccounts(): string[] {
    return this._accounts.map((it) => it.address);
  }

  addAccount(account: Wallet): void {
    const wallet = new Wallet(account.privateKey, this._provider);
    if (wallet.address !== account.address) {
      throw new Error('invalid keypair');
    }
    this._accounts.push(wallet);
  }

  async sign(envelopingRequest: EnvelopingRequest): Promise<string> {
    const callForwarder = envelopingRequest.relayData.callForwarder.toString();
    const fromAddress: string = getAddress(
      envelopingRequest.request.from.toString()
    );

    const data = getEnvelopingRequestDataV4Field({
      chainId: this.chainId,
      verifier: callForwarder,
      envelopingRequest,
      requestTypes: isDeployRequest(envelopingRequest) ? deployRequestType : relayRequestType,
    });

    const wallet = this._accounts.find(
      (account) => getAddress(account.address) === fromAddress
    );
    const { signature, recoveredAddr } = await this._getSignatureFromTypedData(
      data,
      fromAddress,
      wallet
    ).catch((error) => {
      throw new Error(
        `Failed to sign relayed transaction for ${fromAddress}: ${error as string
        }`
      );
    });

    if (recoveredAddr !== fromAddress) {
      throw new Error(
        `Internal RelayClient exception: signature is not correct: sender=${fromAddress}, recovered=${recoveredAddr}`
      );
    }

    return signature;
  }

  private async _getSignatureFromTypedData(
    data: TypedMessage<EnvelopingMessageTypes>,
    from: string,
    wallet?: Wallet
  ): Promise<{ signature: string; recoveredAddr: string }> {

    const signature: string = wallet
      ? await this._signWithWallet(wallet, data)
      : await this._signWithProvider(from, data);
    const recoveredAddr = this._recoverSignature(data, signature);

    return { signature, recoveredAddr };
  }

  private _recoverSignature(
    data: TypedMessage<EnvelopingMessageTypes>,
    signature: string
  ) {
    const { domain, types, value } = data;

    return utils.verifyTypedData(domain, types, value, signature);
  }

  private async _signWithProvider<T>(
    from: string,
    data: TypedMessage<EnvelopingMessageTypes>,
    signatureVersion = 'v4',
    jsonStringify = true
  ): Promise<T> {
    const provider = this._provider as providers.JsonRpcProvider;
    if (!provider.send) {
      throw new Error(`Not an RPC provider`);
    }

    const { domain, types, value } = data;

    let encondedData: TypedMessage<EnvelopingMessageTypes> | string;
    if (jsonStringify) {
      encondedData = JSON.stringify(_TypedDataEncoder.getPayload(domain, types, value))
    } else {
      encondedData = _TypedDataEncoder.getPayload(domain, types, value) as TypedMessage<EnvelopingMessageTypes>;
    }

    return (await provider.send(`eth_signTypedData_${signatureVersion}`, [
      from,
      encondedData
    ])) as T;
  }

  private async _signWithWallet(
    wallet: Wallet,
    data: TypedMessage<EnvelopingMessageTypes>
  ): Promise<string> {

    const { domain, types, value } = data;

    return await wallet._signTypedData(domain, types, value);
  }
}
