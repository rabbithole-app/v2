import V1 "../V1/Types";
import ExternalStorage "../../ExternalStorage/Types";
import ObjectStorage "../../ObjectStorage/Types";

module {
  public type StableStore = V1.StableStore and {
    externalStorage : ExternalStorage.Store;
    var objectStorageWritePolicy : ObjectStorage.WritePolicy;
  };
};
