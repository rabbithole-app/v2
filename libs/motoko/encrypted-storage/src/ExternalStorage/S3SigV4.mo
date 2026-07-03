import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";

import Components "mo:datetime/Components";
import Hex "mo:hex";
import HMAC "mo:hmac";
import Sha256 "mo:sha2/Sha256";
import UrlTextEncoder "mo:url-kit/UrlTextEncoder";

import T "Types";

module {
  let SERVICE = "s3";
  let ALGORITHM = "AWS4-HMAC-SHA256";
  let MAX_EXPIRES_SECONDS : Nat = 604_800; // AWS SigV4 limit: 7 days.
  let NANOS_PER_SECOND : Int = 1_000_000_000;

  public type PresignArgs = {
    config : T.S3CompatibleTargetConfig;
    credential : T.Credential;
    method : T.PresignedHttpMethod;
    key : Text;
    expiresSeconds : Nat;
    now : Time.Time;
  };

  func methodText(method : T.PresignedHttpMethod) : Text {
    switch (method) {
      case (#GET) "GET";
      case (#PUT) "PUT";
      case (#DELETE) "DELETE";
      case (#HEAD) "HEAD";
    };
  };

  func pad2(value : Nat) : Text {
    if (value < 10) "0" # Nat.toText(value) else Nat.toText(value);
  };

  func awsDateParts(now : Time.Time) : (Text, Text) {
    let components = Components.fromTime(now);
    let date = Int.toText(components.year) # pad2(components.month) # pad2(components.day);
    let seconds = components.nanosecond / 1_000_000_000;
    let timestamp = date # "T" # pad2(components.hour) # pad2(components.minute) # pad2(seconds) # "Z";
    (date, timestamp);
  };

  func encodeQuery(value : Text) : Text {
    UrlTextEncoder.encodeText(value, true);
  };

  func encodePath(path : Text) : Text {
    var encoded = "";
    var first = true;
    for (segment in Text.split(path, #char '/')) {
      if (first) {
        first := false;
      } else {
        encoded #= "/";
      };
      encoded #= UrlTextEncoder.encodeText(segment, true);
    };
    encoded;
  };

  func sha256Hex(text : Text) : Text {
    Sha256.fromBlob(#sha256, Text.encodeUtf8(text))
    |> Blob.toArray(_)
    |> Hex.toText(_);
  };

  func hmac(key : [Nat8], message : Text) : [Nat8] {
    HMAC.generate(key, Text.encodeUtf8(message).vals(), #sha256)
    |> Blob.toArray(_);
  };

  func signingKey(secretAccessKey : Text, dateStamp : Text, region : Text) : [Nat8] {
    let kDate = hmac(Blob.toArray(Text.encodeUtf8("AWS4" # secretAccessKey)), dateStamp);
    let kRegion = hmac(kDate, region);
    let kService = hmac(kRegion, SERVICE);
    hmac(kService, "aws4_request");
  };

  func parseEndpointHost(endpoint : Text) : Result.Result<Text, Text> {
    let ?withoutScheme = Text.stripStart(Text.trim(endpoint, #char ' '), #text "https://") else {
      return #err("endpoint must use https://");
    };
    if (Text.contains(withoutScheme, #char '/') or Text.contains(withoutScheme, #char '?') or Text.contains(withoutScheme, #char '#')) {
      return #err("endpoint must not include path, query, or fragment");
    };
    if (Text.size(withoutScheme) == 0) {
      return #err("endpoint host is required");
    };
    #ok(Text.toLower(withoutScheme));
  };

  func requestHost(config : T.S3CompatibleTargetConfig, endpointHost : Text) : Text {
    if (config.forcePathStyle) {
      endpointHost;
    } else {
      config.bucket # "." # endpointHost;
    };
  };

  func canonicalUriForObject(config : T.S3CompatibleTargetConfig, key : Text) : Text {
    if (config.forcePathStyle) {
      "/" # encodePath(config.bucket # "/" # key);
    } else {
      "/" # encodePath(key);
    };
  };

  func queryWithoutSignature(args : PresignArgs, amzDate : Text, credentialScope : Text) : Text {
    let credentialValue = args.credential.accessKeyId # "/" # credentialScope;
    let tokenParam = switch (args.credential.sessionToken) {
      case (?token) "&X-Amz-Security-Token=" # encodeQuery(token);
      case null "";
    };

    "X-Amz-Algorithm=" # ALGORITHM
    # "&X-Amz-Credential=" # encodeQuery(credentialValue)
    # "&X-Amz-Date=" # amzDate
    # "&X-Amz-Expires=" # Nat.toText(args.expiresSeconds)
    # tokenParam
    # "&X-Amz-SignedHeaders=host";
  };

  public func presign(args : PresignArgs) : Result.Result<T.PresignedUrl, Text> {
    if (args.expiresSeconds == 0 or args.expiresSeconds > MAX_EXPIRES_SECONDS) {
      return #err("expiresSeconds must be between 1 and 604800");
    };

    let endpointHost = switch (parseEndpointHost(args.config.endpoint)) {
      case (#ok(host)) host;
      case (#err(message)) return #err(message);
    };

    let host = requestHost(args.config, endpointHost);
    let canonicalUri = canonicalUriForObject(args.config, args.key);

    let (dateStamp, amzDate) = awsDateParts(args.now);
    let credentialScope = dateStamp # "/" # args.config.region # "/" # SERVICE # "/aws4_request";
    let canonicalQuery = queryWithoutSignature(args, amzDate, credentialScope);
    let method = methodText(args.method);

    let canonicalRequest = method # "\n"
    # canonicalUri # "\n"
    # canonicalQuery # "\n"
    # "host:" # host # "\n"
    # "\n"
    # "host" # "\n"
    # "UNSIGNED-PAYLOAD";

    let stringToSign = ALGORITHM # "\n"
    # amzDate # "\n"
    # credentialScope # "\n"
    # sha256Hex(canonicalRequest);

    let signature = HMAC.generate(signingKey(args.credential.secretAccessKey, dateStamp, args.config.region), Text.encodeUtf8(stringToSign).vals(), #sha256)
    |> Blob.toArray(_)
    |> Hex.toText(_);

    let url = "https://" # host # canonicalUri # "?" # canonicalQuery # "&X-Amz-Signature=" # signature;
    #ok({
      method;
      url;
      key = args.key;
      expiresAt = args.now + args.expiresSeconds * NANOS_PER_SECOND;
      signedHeaders = [("host", host)];
      requestHeaders = [];
    });
  };

};
