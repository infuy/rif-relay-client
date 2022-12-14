import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import config from 'config';
import type Sinon from 'sinon';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { HttpClient } from '../src/api/common';
import type { EnvelopingConfig } from '../src/common/config.types';
import type {
  HubInfo,
  RelayInfo,
  RelayManagerData,
} from '../src/common/relayHub.types';
import { ENVELOPING_ROOT } from '../src/constants/configs';
import { selectNextRelay } from '../src/utils';
import { FAKE_ENVELOPING_CONFIG } from './config.fakes';
import { FAKE_HUB_INFO } from './relayHub.fakes';

use(sinonChai);
use(chaiAsPromised);

describe('utils', function () {
  const originalConfig = { ...config };
  const unavailableRelayHub: HubInfo = {
    ...FAKE_HUB_INFO,
    ready: false,
  };

  const availableRelayHub: HubInfo = {
    ...FAKE_HUB_INFO,
    ready: true,
  };

  const preferredRelays: EnvelopingConfig['preferredRelays'] = [
    {
      manager: '',
      url: 'https://first.relay.co',
      currentlyStaked: true,
      registered: true,
    },
    {
      manager: '',
      url: 'http://second.relay.co',
      currentlyStaked: true,
      registered: true,
    },
    {
      manager: '',
      url: 'http://third.relay.co',
      currentlyStaked: true,
      registered: true,
    },
  ];

  let httpClientStub: Sinon.SinonStubbedInstance<HttpClient>;

  before(function () {
    config.util.extendDeep(config, {
      EnvelopingConfig: {
        ...FAKE_ENVELOPING_CONFIG,
        preferredRelays,
      },
    });
  });

  after(function () {
    config.util.extendDeep(config, originalConfig);
  });

  beforeEach(function () {
    httpClientStub = sinon.createStubInstance(HttpClient);
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('getEnvelopingConfig', function () {
    it('Should fail if cannnot find a config', async function () {
      const ERROR_MESSAGE = `Could not read enveloping configuration. Make sure your configuration is nested under ${ENVELOPING_ROOT} key.`;
      sinon.stub(config, 'get').throws(new Error(ERROR_MESSAGE));

      await expect(selectNextRelay(httpClientStub)).to.be.rejectedWith(
        ERROR_MESSAGE
      );
    });
  });

  describe('selectNextRelay() function', function () {
    it('Should iterate the array of relays and select an available one', async function () {
      httpClientStub.getChainInfo
        .onFirstCall()
        .resolves(unavailableRelayHub)
        .onSecondCall()
        .resolves(availableRelayHub);
      const { url: expectedUrl } = preferredRelays[1] as RelayManagerData;

      const {
        relayInfo: { url: actualUrl },
      } = (await selectNextRelay(httpClientStub)) as RelayInfo;

      expect(actualUrl).to.equal(expectedUrl);
    });

    it('Should return undefined if not relay is available', async function () {
      httpClientStub.getChainInfo.resolves(unavailableRelayHub);
      const nextRelay = await selectNextRelay(httpClientStub);

      expect(nextRelay).to.be.undefined;
    });

    it('Should keep iterating if a ping call throws an error', async function () {
      const { url: expectedUrl } = preferredRelays[1] as RelayManagerData;
      httpClientStub.getChainInfo
        .onFirstCall()
        .throws(new Error('Some fake error'))
        .onSecondCall()
        .resolves(availableRelayHub);
      const {
        relayInfo: { url: actualUrl },
      } = (await selectNextRelay(httpClientStub)) as RelayInfo;

      expect(actualUrl).to.equal(expectedUrl);
    });
  });
});