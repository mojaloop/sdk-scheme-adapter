const config = {
  inbound: {
    tls: {
      mutualTLS: {
        enabled: false,
      },
      creds: {
      },
    },
  },
  outbound: {
    tls: {
      mutualTLS: {
        enabled: true,
      },
      creds: {},
    },
  },
  jwsSigningKey: "-----BEGIN RSA PRIVATE KEY-----\r\nMIIEpAIBAAKCAQEAxHDGxfi47sLeC2+FKulAKZpBGsQp/cL6d0wTake0QZv21OTGGpXz6cC5\r\nyRJliQCqsVLYAGD5WYuKxeN3nGzbGDPR1TwNLM78Z4cKTa0h2oOm4E8tb5xdrNjsXaK8ALYa\r\n+aWDcIHqg7UWzt74Vzphmx4eB6uAWYjFx2L5Fa+buiFdV4I//z6w7Od9bkbQ3XZblJC23V+O\r\nCh278s+eij9AgqttIlpcw/x8El/PMzOVC/lsdtepJAvqv28D/52regs5dBrpvaKWPB0YNkQG\r\nVaDhXEiTcNjjpnfc2ET5uIz6UDqepi0BcD8+hkJwv6g8gdfKnlNq/ZmJ8N81FSV4M99hhwID\r\nAQABAoIBAQCg50NZy5YnNATO1yT79hyxNwGW3BENI5Um/HB2wI78orS2w0Ela6hj0pIbCe+T\r\nHbGzF4mIHeaAm1UrLFvADEYV9/QrNkoQZubGIg2lfGfbZbTdzN0Jq8nrF6/cLrzR1FgaHqGg\r\nGTovcbhh8K74PADRHwU4ARlbvTVLUV13juT+un6EqcblcjOULFJ0yOaam9VNisXIEQ0VwK85\r\nEHWZyZxyW8IVSPEmiW8liytqZ3f3O489k1CY5de6+QNF6cOzA+ey1L1XaBdHTsKkR8CGneOY\r\n7HYJgzsUBzL8JbdSimqBT36oEW52NsSiVuOono/DYop252UVXHxiYZQWjdWvF29hAoGBAPaR\r\njnG/T+f3uqrVmbQWo7+den/ZYtrsVhYpModlTf1xamRZKbpRwj0ORb60agMbncPkADYoK9YY\r\nYcUd7GjyqaxY+x71pg3Mh5EYyE03w5kpZUHXmx77pzczh2q/OtWbTuWf7PRkkHX5QacPzeqb\r\nidK7n1ZgJv3jdk85RynEVBoRAoGBAMv0W3SPSrD8xIYFfddR3O8x+kvQRhjnqdFz8kdyi8Jj\r\nUj98MOUPlGxMBTDrz19AZZ+OELVrKRqiNmeqa6jRe3i6ykGOFvzULenzYG56BYpIUbWwTDXg\r\nDwFaUrCPZSDSRMhIQZzVtjzpaGWx2FzjMGMwUXMvCO0pkgNh7+vvJmoXAoGAD5se3Owy7oer\r\ndOyYEeHs80/QVQ85Ron22Og6nn829HedOES8c2KBXMPufieFHjU9QwzHRqY8QAzDA2rlb68M\r\nNjBblJYPsIflfLWI1/pTkvofwo8W7lsXNlM4mvUHkEWINNhucvl6ez0PfrdtXRADJSdi6mCj\r\nlyYycsk5S9d1S0ECgYEAt0/xw1nnMByAJlVZPeZ+RR8OcIXJ+yh9IZys7jquExFiI11kNP1D\r\n0fKh186anGos7LOroOOoFiAl9hbenOVrrJ92mmUzlBrBCb2Ntr5FrHxDtKG4XdP8qKKeH8NC\r\nibVzzO/kySnsmeLPyleGuDYaj4wmKPjldQQgEJo+IjjYthECgYBWN72LH59cDySsLdwxygj8\r\neqcRAcrRTrNuyNgJQYLkZolxnSkA9M+zOsqr4mQQ2DbsE+v3fNwwlATkvJwhi1lqqT0n4M9x\r\nqxKEimfJcnKIY6vC+WUem7/GUdmR4MsLHOMJqHWsrn+5+AusVrFo1RHegfF8A90Av/8pt/4C\r\nDz4CGQ==\r\n-----END RSA PRIVATE KEY-----\r\n",
  oidc: {
    auth: {
      staticToken: "7718fa9b-be13-3fe7-87f0-a12cf1628168",
      tokenEndpoint: "https://localhost:443/token",
      clientKey: "MGcnvk1iaqZAxdaoBlfUqYjqkD0a",
      clientSecret: "pW1Zh6jQXxTzk2591EFRYMNYsVAa",
      refreshSeconds: 3600,
    },
    requestAuthFailureRetryTimes: 0,
  },
  peerJWSKeys: {
    switch: "-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtut0NspC2FCI3dTGqeg5\ntP9cCx2a6STaASMGKFHKbBkjj3Z+E2FOKv4buYyo+RtXIiwaGuBsakZijF8PGuyt\nS11PW4o7MBTRUW00UbFPyecLjvRJdfPh0WuqPdSwxvowdVMnQ8FJ9muLpKXbT8qX\nfRgYJnelNB/bGg/W6fT+mv2yFlWvvN/ukzckPkFbZQOxEbZFApgbdoe8Ad3CYOOH\nv2I1FIUV3qfvvqsN2q/bRSg+sLr9kXgWSw3DufDgxTSvljcD/Jua4iwycvzi8z7H\nyiqTr55zpfINqc7pH267JvmuwhZ33v0GJR+Jj4gDdvqMaLbtMGqDZSuJ7K0zMvpQ\nLnlh0d6u6+oF+9HHSVfuMhPRGdVNCqJK4RCS/E9oeeLC/Uv32NtttAQpNcqlD8lO\nKrB4I80aSMtbpOWZMAWXCvDMJICrhCvkmQ/vsJ82NGq3YEkYGftIzXCcXtE7qT5g\nKv24/d8DEuc06oR29FfXIpXsaTylvAItelt0HQNqM3XiyIxzH17Blq9lGR5qyYpJ\n/pKWhQQa73ud6HrcoPVUN94SrP5e8mu9WAIhTmfVkF4ZJOf9F8oRh0mwxD7G9Ibb\nUYUaeyR0k8nX9K1tRIhSkuh91JS/TcEEs7VnSL5Mqx1osZpBjM7si/gi+q5xjtGF\n2Q3AE7vEe5JQje6ziX8w/MMCAwEAAQ==\n-----END PUBLIC KEY-----\n",
    pm4mlttksim1: "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7n/NY57tDMBJKGFcXUXNFoVx6XVq\r\nVODhdGEkYLmE3iVJi+D9eSBGKh8coCOrFquitCObIShB4xzwT7NFNom2118PnTcUQuwaqH+q\r\nCbgugtVJ6O2J2+6tIccypezkA55tThujuhetoBH1+aoipI+M7vul24b5L0TV1SZHc7xchwWG\r\n864Ayue+zeZc2grqnXZTL3h3rHYvwBz0iVYB+g7/IwLlKUmqBE4OAaeQZIlsI03GgEiOlZIA\r\nEPZMwVHwXa8Z1Yr25zT39bdEtCZYbKaDGDgA/VonsMIvPjW3SLsMjAnZ+rQf5tp0GssopTGW\r\n8wa3kwcUR5KwUR0qzQwuATkyzQIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
    pm4mlsenderfsp: "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxHDGxfi47sLeC2+FKulAKZpBGsQp\r\n/cL6d0wTake0QZv21OTGGpXz6cC5yRJliQCqsVLYAGD5WYuKxeN3nGzbGDPR1TwNLM78Z4cK\r\nTa0h2oOm4E8tb5xdrNjsXaK8ALYa+aWDcIHqg7UWzt74Vzphmx4eB6uAWYjFx2L5Fa+buiFd\r\nV4I//z6w7Od9bkbQ3XZblJC23V+OCh278s+eij9AgqttIlpcw/x8El/PMzOVC/lsdtepJAvq\r\nv28D/52regs5dBrpvaKWPB0YNkQGVaDhXEiTcNjjpnfc2ET5uIz6UDqepi0BcD8+hkJwv6g8\r\ngdfKnlNq/ZmJ8N81FSV4M99hhwIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
    pm4mlttksim3: "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1YZ7FXykgWMZjKk6dnkKMIjuh/Mh\r\nZ/cM/Uczb2aGytj3MvdGYlxMOPofWuPvOQHTlMFGspqYYcZuWneKdh+40jm6kJd9t4uu9t27\r\nu0APQuzfFKy928eKn+vsk0msdVu/xEyxVK6KQlbETKTmwp4gOUUPD1kk2LUPi/tSe6zwFwX5\r\nb1WOZb9Jd9i/gEAFVUl6cWMa4WAStFlNFgjZN3l7OpNcFfHJKQ2XflZevw9QF/HlDLV+FexL\r\nxG65zfhwPLLi1kZAh8TqTEZhGvVLp9R02bA+PnKO3k6xyPAWW4Ak60cNBpwFDtbjOS/n3qiY\r\nwKc6EsgsJMzCfwkkqkHKlU9diwIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
    demomfi: "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqBxOxxhUBYw+Nb0Iz/s/n6CWFncL\r\nl+vls4ezqBmXiRfY6X4mCuDR+6p1BXr7pXpsGkjXDwVW9qRXOwcZTlAUrlbRbLIJGAvTGBg7\r\nNFQo79eM5PQq2uoTrpuHWXAPAqrRwwKvSyBsKfmXmXN+m6GQBLYWnz4QlLYNtx5QdMF16PTI\r\noxB371BidwLK9PAAdh5Hy8DeCipMx1KaAHJ6u98Kko0dkKO4HWXgce6YinPhcOofXwUCpfnv\r\nf/zd2rfvkqs8PG0UUUtSwuf+2W1PeYu1DjpTJP+a/VpEdUKexi5eQPH2RZWjIvYtQ1nj3U7n\r\ntp8LbZPFWpEUyXVBqhyb4VVX7wIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
    demowallet: "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7h+AY5G326SUY64xF8GxGQQG31ed\r\nBILfjqKvCganZpeda6v3RGBqCVyG+rGF4OHideAfWAfed3rwNvbZczchmZWZjQHl3X4CetCz\r\nvFNklJ0EySyGwLPAGhtax4vnYx/zY/SCBqqrvm/pNqj6zWYwuZ2Cn5RvM9+2QlGXHfKPa0Rb\r\nYPv/8Yw+x5u0sV3N5mwI3aP9LmmZRkhrReShO9jlDE7XHzkIJjqPszAdxgA6mWBbSy4kzCVP\r\nPVvXpDZ1SPDApEDDxzfoE612ULxYk1zOr7dBz5HPGli7Ppr2TPdAehIhCNhe2rNQrO4Bx2/0\r\nH8vKTZALqsP03eegBzDdhE8xowIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
    pm4mlttksim2: "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtU+C7sNkHrdpfC2IhY4veEG/hU4/\r\nCZH48oGDfDXMvFw9uKHvLvnCqmJddyqy/T/V7GBrdzHRdewYy34gToXHiTL565PFz31oK/pY\r\n+7Ru9y2dJLe7Ze5aK0DFCTuD1fdGRjQIBoF6p0Qvah7Hsa99s4JFbDDA+Wkn9F/cmJCIfEzw\r\nvAH3nqcZ2hEpSHoqc5mmOfJIYrDJ8ZrCGeil9pRZ/K/I8KGEBSvLuzfsuLjtabuaJQaUkpNG\r\na8AO+2VH2KxqgAvz9jbTpVpjniScVqe8JHmFkHZmmA/ur3pifZenPgn5jpLVrTIEIjOhQCry\r\nQe/r4RBclOZcdOdt1uD5fUDdhwIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
    pm4mlreceiverfsp: "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1IKlO+AsnMEr5NLHmtn0QS/G0TWk\r\n4HiRqMPUBogGVhFzt28VZKnsqxoXyrE7uCJ1Ehm2t/w9bsweVz8yR09EgCsKvzv7C3KSr+wE\r\nRlX754TZmA4bylcH6xjFIrSGYKdOiFaxwctBLsKgVv5e/n4uxN8M0ykrBBomQ6Q2jPzxAH3v\r\n1MZ0j/UTNuXXhSButIyXldRkgUBB3D/3YZbqnnjjNwsf6gLgWVg6IAZndCZ5jXsHs1Vyn7f7\r\nbGdknHuzukwmrjgnmhNhxCi2baXOmbQCQADGcpDuTJgG7TwHmhWtE6YsBDKsb5uMZim4v28N\r\n6TjftBN+2AnicM8YcF3CN48FhwIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
  },
}

module.exports = config;
