import ExternalStorage "../ExternalStorage/Types";

module {
  public type WritePolicy = {
    #CaffeineManaged;
    #ExternalS3Active : {
      targetId : ExternalStorage.TargetId;
    };
  };

  public type Status = {
    writePolicy : WritePolicy;
    activeTargetId : ?ExternalStorage.TargetId;
    setupRequired : Bool;
  };

  public type UploadRoute = {
    #OnChain;
    #CaffeineBlobStorage;
    #ExternalS3SetupRequired;
    #ExternalS3 : {
      targetId : ExternalStorage.TargetId;
      targetVersion : Nat;
      layoutVersion : Nat;
      readMode : ExternalStorage.ReadMode;
      writeMode : ExternalStorage.WriteMode;
    };
  };

  public type BlobReadRoute = {
    #OnChain;
    #CaffeineBlobStorage;
    #ExternalS3PublicEncrypted : {
      target : ExternalStorage.TargetView;
      locator : ExternalStorage.BlobLocator;
    };
  };
};
