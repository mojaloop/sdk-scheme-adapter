OUTPUT_DIR="."
setopt +o nomatch
rm *.key *.pem *.csr *.crt *.srl

#####################

## Generating Hub CA certificate
openssl req -x509 -config openssl-hub-ca.cnf -newkey rsa:4096 -sha256 -nodes -out hub_cacert.pem -outform PEM

## Generating DFSP CA certificate
openssl req -x509 -config openssl-dfsp-ca.cnf -newkey rsa:4096 -sha256 -nodes -out dfsp_cacert.pem -outform PEM

#####################

## Generate Hub server csr
openssl req -config openssl-hub-server.cnf -newkey rsa:4096 -sha256 -nodes -out hub_server.csr -outform PEM

## Sign Hub server cert with DFSP CA
openssl ca -config openssl-dfsp-ca.cnf -policy signing_policy -extensions signing_req -out hub_server_cert.pem -infiles hub_server.csr

## Append ca cert to PEM file
cat dfsp_cacert.pem >> hub_server_cert.pem

## Append key to PEM file
cat hub_server_key.key >> hub_server_cert.pem

#####################

## Generate client csr
openssl req -config openssl-dfsp-client.cnf -newkey rsa:4096 -sha256 -nodes -out dfsp_client.csr -outform PEM

## Sign DFSP client cert with Hub CA
openssl ca -config openssl-hub-ca.cnf -policy signing_policy -extensions signing_req -out dfsp_client_cert.crt -infiles dfsp_client.csr
