export type ApiEnvelope<T> = {
  data: T;
};

export type ApiCollectionEnvelope<T> = {
  data: T[];
  meta: {
    count: number;
  };
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
};

export type RequestId = string;
