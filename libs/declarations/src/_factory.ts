import { idlFactory as idlFactoryCertifiedCmc } from "./cmc/cmc.certified.idl";
import { idlFactory as idlFactoryCmc } from "./cmc/cmc.idl";
import { idlFactory as idlFactoryCertifiedIcManagement } from "./ic-management/ic-management.certified.idl";
import { idlFactory as idlFactoryIcManagement } from "./ic-management/ic-management.idl";
import { idlFactory as idlFactoryCertifiedIcpIndex } from "./ledger-icp/index.certified.idl";
import { idlFactory as idlFactoryIcpIndex } from "./ledger-icp/index.idl";
import { idlFactory as idlFactoryCertifiedIcpLedger } from "./ledger-icp/ledger.certified.idl";
import { idlFactory as idlFactoryIcpLedger } from "./ledger-icp/ledger.idl";
import { idlFactory as idlFactoryCertifiedIcrcIndex } from "./ledger-icrc/icrc_index.certified.idl";
import { idlFactory as idlFactoryIcrcIndex } from "./ledger-icrc/icrc_index.idl";
import { idlFactory as idlFactoryCertifiedIcrcLedger } from "./ledger-icrc/icrc_ledger.certified.idl";
import { idlFactory as idlFactoryIcrcLedger } from "./ledger-icrc/icrc_ledger.idl";
import { init as initIcrcLedger } from "./ledger-icrc/icrc_ledger.idl.js";
import { idlFactory as idlFactoryCertifiedIcrcNftLedger } from "./ledger-icrc/icrc_nft-ledger.certified.idl";
import { idlFactory as idlFactoryIcrcNftLedger } from "./ledger-icrc/icrc_nft-ledger.idl";
import { idlFactory as idlFactoryXrcMock, init as initXrc } from "./xrc-mock/xrc.did";
import { idlFactory as idlFactoryEvmRpc, init as initEvmRpc } from "./evm-rpc/evm_rpc.did";

import type { _SERVICE as CmcService } from "./cmc/cmc";
import type { _SERVICE as IcManagementService } from "./ic-management/ic-management";
import type { _SERVICE as IcpIndexService } from "./ledger-icp/index";
import type { _SERVICE as IcpLedgerService } from "./ledger-icp/ledger";
import type { _SERVICE as IcrcIcrc1Service } from "./ledger-icrc/icrc_icrc-1";
import type { _SERVICE as IcrcIndexService } from "./ledger-icrc/icrc_index";
import type { _SERVICE as IcrcLedgerService } from "./ledger-icrc/icrc_ledger";
import type { _SERVICE as IcrcNftLedgerService } from "./ledger-icrc/icrc_nft-ledger";
import type { _SERVICE as XrcMockService } from "./xrc-mock/xrc.did";

export {
  idlFactoryCertifiedCmc,
  idlFactoryCertifiedIcManagement,
  idlFactoryCertifiedIcpIndex,
  idlFactoryCertifiedIcpLedger,
  idlFactoryCertifiedIcrcIndex,
  idlFactoryCertifiedIcrcLedger,
  idlFactoryCertifiedIcrcNftLedger,
  idlFactoryCmc,
  idlFactoryIcManagement,
  idlFactoryIcpIndex,
  idlFactoryIcpLedger,
  idlFactoryIcrcIndex,
  idlFactoryIcrcLedger,
  idlFactoryIcrcNftLedger,
  idlFactoryXrcMock,
  idlFactoryEvmRpc,
  initXrc,
  initIcrcLedger,
  initEvmRpc,
  type CmcService,
  type IcManagementService,
  type IcpIndexService,
  type IcpLedgerService,
  type IcrcIcrc1Service,
  type IcrcIndexService,
  type IcrcLedgerService,
  type IcrcNftLedgerService,
  type XrcMockService
};
