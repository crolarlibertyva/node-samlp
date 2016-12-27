var expect        = require('chai').expect;
var server        = require('./fixture/server');
var request       = require('request');
var cheerio       = require('cheerio');
var xmldom        = require('xmldom');
var xmlhelper     = require('./xmlhelper');
var zlib          = require('zlib');
var utils         = require('../lib/utils');
var qs            = require('querystring');
var InMemoryStore = require('../lib/store/in_memory_store');
var fs            = require('fs');
var path          = require('path');

var sp1_credentials = {
  cert:     fs.readFileSync(path.join(__dirname, 'fixture', 'sp1.pem')),
  key:      fs.readFileSync(path.join(__dirname, 'fixture', 'sp1.key')),
};

var sp2_credentials = {
  cert:     fs.readFileSync(path.join(__dirname, 'fixture', 'sp2.pem')),
  key:      fs.readFileSync(path.join(__dirname, 'fixture', 'sp2.key')),
};

describe('samlp logout with Session Participants', function () {
  var sessions = [], failed, returnError;
  var samlIdPIssuer = 'urn:fixture-test';
  var testStore = new InMemoryStore();

  before(function (done) {
    server.start( { 
      audience: 'https://auth0-dev-ed.my.salesforce.com',
      issuer: samlIdPIssuer,
      store: testStore,
      sessionHandler: {
        getActiveSessions: function (cb) {
          cb(null, sessions);
        },
        clearIdPSession: function(cb){
          if (returnError){
            cb(new Error('There was an error cleaning session'));
          }
          cb();
        },
        setLogoutStatusFailed: function(){
          failed = true;
        },
        isLogoutFailed: function(){
          return failed;
        }
      }
    },done);
  });

  after(function (done) {
    server.close(done);
  });

  var body, $, signedAssertion;

  beforeEach(function (done) {
    request.get({
      jar: request.jar(), 
      uri: 'http://localhost:5050/samlp?SAMLRequest=fZJbc6owFIX%2FCpN3EAEVMmIHEfDaqlCP%2BtKJELkUEkqCl%2F76Uj3O9JyHPmay9l4r%2BVb%2F6VLkwglXLKXEBG1JBgImIY1SEpvgNXBFHTwN%2BgwVeQmtmidkjT9qzLjQzBEGbxcmqCsCKWIpgwQVmEEeQt9azKEiybCsKKchzYFgMYYr3hjZlLC6wJWPq1Ma4tf13AQJ5yWDrVZO45RIDOWYHWkVYimkBRBGjWVKEL%2BlfEhDSjhlVEJNLvlb1%2FqOA4TJyARvynPH80qFFJPAdg%2Fh1fNnGVqpKO3OLkZonUfJ0Nu2Y2t6PdlVPj1RZxVlThywI8rihVH0MuksTQz3sx1Fm2xv5LO9nYSs5KXxfnm364%2FwfMDPWMqn182qHOqpjzR0dncsM6xO1Vs7h860HI97yrB7xHE9dt2loy%2FQu1prie%2FMcuNNL2i6nUdWp%2Fdnk3yekb7dXYhWjFjil%2Br2IC%2Bd%2FexlNF7wS77Zomvo7epFbCuyVx5tq3klYzWeEMYR4SZQ5LYqypqo6IGiQE2FmiKpencPhOXf%2Fx%2Bm5E71N1iHu4jBcRAsxeWLHwBh82hHIwD3LsCbefWjBL%2BvRQ%2FyYPCAd4MmRvgk4kgqrv8R77d%2B2Azup38LOPgC&RelayState=123'
    }, function (err, response, b){
      if(err) return done(err);
      expect(response.statusCode)
        .to.equal(200);

      body = b;
      $ = cheerio.load(body);
      var SAMLResponse = $('input[name="SAMLResponse"]').attr('value');
      var decoded = new Buffer(SAMLResponse, 'base64').toString();
      signedAssertion = /(<saml:Assertion.*<\/saml:Assertion>)/.exec(decoded)[1];
      done();
    });
  });

  describe('HTTP Redirect', function () {
    describe('SP initiated - Should fail if No Issuer is present', function () {
      var logoutResultValue;

      before(function () {
        testStore.clear();

        sessions.splice(0);
        sessions.push({
          serviceProviderId : 'https://foobarsupport.zendesk.com',
          nameID: 'foo@example.com',
          sessionIndex: '1',
          serviceProviderLogoutURL: 'https://example.com/logout',
          cert: sp1_credentials.cert // SP1 public Cert
        });
      });

      // SAMLRequest: base64 encoded + deflated + URLEncoded
      // Signature: URLEncoded
      // SigAlg: URLEncoded

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>https://foobarsupport.zendesk.com</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>1</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        request.get({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout?SAMLRequest=fZFBS8QwEIXvgv%2Bh5J6a6da1hra4sAiF1YMrHrxl06kUmqRmUujPN1tXWBWdwxzmvW%2FmwZSkzDDKnXtzU3jC9wkpJLMZLMlFqdjkrXSKepJWGSQZtNxvHnYyS4UcvQtOu4GdIf8Tigh96J1lSbOt2BHwPMuEvhHXyDXEBoBrfluonKPu8sNBY76CIvqJJmwsBWVDxTIBaw4Zh9UzFFKAhOyVJS%2FoKS6PcipYfXmRnKo8HpKPMU6zTe6dNyr8nRNSWCZ9y7vFKtGofti0rUciVnfO3eGszDhgqp0pr86W%2F7q5j0hM1NgW5xpO3m%2FDL%2BJT%2B%2FGL%2BgM%3D&Signature=CUwze47fZpFBtD7YRGyAzRyTrK7l8pxsg%2BiUan8N%2FVPAOOVYXcNElksrYrpZLPSAVhZbWlQYLJjuYxicY%2FVIG%2FiGjoNlPUMiAGsb4vfBumgDeShns22fdSYZ27hF0NL3%2FI%2FcUThvz4wCwcFb6XTmY101Wbew3gLVdBcsx17YwIns52TNmMjG0wsW9KtGZ4jrrZ1kGJ0rsDf5BL4jBIT5KgZYF2u4xOo2v6ysUPf3lG4ALRWqJFdAdkOVJ%2BdUO%2B47n57G4q1YcFDwoL%2BTM%2B02qXV1QwiTyMXttQI25DX4%2BEru2rAA7LN9F3KPabINu4vV%2FF9TAU2DBHCFNArcRDa%2FsA%3D%3D&RelayState=123&SigAlg=http%3A%2F%2Fwww.w3.org%2F2000%2F09%2Fxmldsig%23rsa-sha1'
        }, function (err, response){
          if(err) return done(err);
          expect(response.statusCode).to.equal(400);
          logoutResultValue = response.body;

          done();
        });
      });

      it('should respond with an Error message', function () {
        expect(logoutResultValue).to.equal('SAML Request with no issuer. Issuer is a mandatory element.');
      });
    });

    describe('SP initiated - 1 Session Participant', function () {
      var logoutResultValue;

      before(function () {
        testStore.clear();

        sessions.splice(0);
        sessions.push({
          serviceProviderId : 'https://foobarsupport.zendesk.com',
          nameID: 'foo@example.com',
          sessionIndex: '1',
          serviceProviderLogoutURL: 'https://example.com/logout',
          cert: sp1_credentials.cert // SP1 public Cert
        });
      });

      // SAMLRequest: base64 encoded + deflated + URLEncoded
      // Signature: URLEncoded
      // SigAlg: URLEncoded

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>https://foobarsupport.zendesk.com</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>1</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        request.get({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout?SAMLRequest=fVFNS8NAEL0L%2Foew900zaa1xaIOFIgSqBysevG03Uw1md%2BPOBoq%2F3m1aoVZ0DnOY97WPnbEybYcr9%2Br68EgfPXFIdqa1jAMyF7236BQ3jFYZYgwa14v7FeZphp13wWnXihPJ%2FwrFTD40zoqkWs7FXuBlnmf6OrsiqSEuAJrKm0JNJOntZLPRNBlDEfnMPVWWg7JhLvIMphJyCeMnKDADhPxFJM%2FkOZpHOM1EeXmRHGe2D8LBwZdvIXSMo9HWuY3y3Hed8yH9JFsTv6famdnolH7u8hBLVcvkznmjwt9tIYXh0tRyO1CRjGraRV17YhZlTL%2BlnTJdSyeZB%2FNfmesoib2q%2BMRdCUfuj%2BO34oCd%2FWj5BQ%3D%3D&Signature=NkobB0DS0M4kfV89R%2Bma0wp0djNr4GW2ziVemwSvVYy2iF432qjs%2FC4Y1cZDXwuF5OxMgu4DuelS5mW3Z%2B46XXkoMVBizbd%2BIuJUFQcvLtiXHkoaEk8HVU0v5bA9TDoc9Ve7A0nUgKPciH7KTcFSr45vepyg0dMMQtarsUZeYSRPM0QlwxXKCWRQJDwGHLie5dMCZTRNUEcm9PtWZij714j11HI15u6Fp5GDnhp7mzKuAUdSIKHzNKAS2J4S8xZz9n9UTCl3uBbgfxZ3av6%2FMQf7HThxTl%2FIOmU%2FYCAN6DWWE%2BQ3Z11bgU06P39ZuLW2fRBOfIOO6iTEaAdORrdBOw%3D%3D&RelayState=123&SigAlg=http%3A%2F%2Fwww.w3.org%2F2000%2F09%2Fxmldsig%23rsa-sha1'
        }, function (err, response){
          if(err) return done(err);
          expect(response.statusCode).to.equal(302);
          var qs = require('querystring');
          var i = response.headers.location.indexOf('SAMLResponse=');
          var SAMLResponse = qs.parse(response.headers.location.substr(i)).SAMLResponse;
          
          zlib.inflateRaw(new Buffer(SAMLResponse, 'base64'), function (err, decodedAndInflated) {
            if(err) return done(err);
            signedAssertion = /(<samlp:StatusCode.*\/>)/.exec(decodedAndInflated)[1];
            var doc = new xmldom.DOMParser().parseFromString(signedAssertion);
            logoutResultValue = doc.documentElement.getAttribute('Value');

            done();
          });
        });
      });

      it('should respond with a Success value', function () {
        expect(logoutResultValue).to.equal('urn:oasis:names:tc:SAML:2.0:status:Success');
      });

      it('should remove session from sessions array', function () {
        expect(sessions.length).to.equal(0);
      });
    });

    describe('SP initiated - 2 Session Participants', function () {
      var SAMLRequest;
      var sessionParticipantLogoutRequest;
      var sessionParticipantLogoutRequestRelayState;
      var sessionParticipantLogoutRequestSigAlg;
      var sessionParticipantLogoutRequestSignature;

      var sessionParticipant1 = { // Logout Initiator
        serviceProviderId : 'https://foobarsupport.zendesk.com', // Issuer
        nameID: 'foo@example.com',
        sessionIndex: '1',
        serviceProviderLogoutURL: 'https://foobarsupport.zendesk.com/logout',
        cert: sp1_credentials.cert // SP1 public Cert
      };

      var sessionParticipant2 = {
        serviceProviderId : 'https://foobarsupport.example.com', // Issuer
        nameID: 'bar@example.com',
        sessionIndex: '2',
        serviceProviderLogoutURL: 'https://foobarsupport.example.com/logout',
        cert: sp2_credentials.cert // SP2 public Cert
      };

      before(function () {
        testStore.clear();

        sessions.splice(0);
        sessions.push(sessionParticipant1);
        sessions.push(sessionParticipant2);
      });

      // SAMLRequest: base64 encoded + deflated + URLEncoded
      // Signature: URLEncoded
      // SigAlg: URLEncoded

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>https://foobarsupport.zendesk.com</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>1</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        request.get({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout?SAMLRequest=fVFNS8NAEL0L%2Foew900zaa1xaIOFIgSqBysevG03Uw1md%2BPOBoq%2F3m1aoVZ0DnOY97WPnbEybYcr9%2Br68EgfPXFIdqa1jAMyF7236BQ3jFYZYgwa14v7FeZphp13wWnXihPJ%2FwrFTD40zoqkWs7FXuBlnmf6OrsiqSEuAJrKm0JNJOntZLPRNBlDEfnMPVWWg7JhLvIMphJyCeMnKDADhPxFJM%2FkOZpHOM1EeXmRHGe2D8LBwZdvIXSMo9HWuY3y3Hed8yH9JFsTv6famdnolH7u8hBLVcvkznmjwt9tIYXh0tRyO1CRjGraRV17YhZlTL%2BlnTJdSyeZB%2FNfmesoib2q%2BMRdCUfuj%2BO34oCd%2FWj5BQ%3D%3D&Signature=NkobB0DS0M4kfV89R%2Bma0wp0djNr4GW2ziVemwSvVYy2iF432qjs%2FC4Y1cZDXwuF5OxMgu4DuelS5mW3Z%2B46XXkoMVBizbd%2BIuJUFQcvLtiXHkoaEk8HVU0v5bA9TDoc9Ve7A0nUgKPciH7KTcFSr45vepyg0dMMQtarsUZeYSRPM0QlwxXKCWRQJDwGHLie5dMCZTRNUEcm9PtWZij714j11HI15u6Fp5GDnhp7mzKuAUdSIKHzNKAS2J4S8xZz9n9UTCl3uBbgfxZ3av6%2FMQf7HThxTl%2FIOmU%2FYCAN6DWWE%2BQ3Z11bgU06P39ZuLW2fRBOfIOO6iTEaAdORrdBOw%3D%3D&RelayState=123&SigAlg=http%3A%2F%2Fwww.w3.org%2F2000%2F09%2Fxmldsig%23rsa-sha1'
        }, function (err, response){
          if(err) return done(err);
          // First it should come the LogoutRequest to the 2nd Session Participant as a redirect
          expect(response.statusCode).to.equal(302);

          var i = response.headers.location.indexOf('?');
          var completeQueryString = response.headers.location.substr(i+1);
          var parsedQueryString = qs.parse(completeQueryString);

          SAMLRequest = parsedQueryString.SAMLRequest;
          sessionParticipantLogoutRequestRelayState = parsedQueryString.RelayState;
          sessionParticipantLogoutRequestSigAlg = parsedQueryString.SigAlg;
          sessionParticipantLogoutRequestSignature = parsedQueryString.Signature;

          zlib.inflateRaw(new Buffer(SAMLRequest, 'base64'), function (err, decodedAndInflated) {
            if(err) return done(err);
            sessionParticipantLogoutRequest = decodedAndInflated.toString();

            done();
          });
        });
      });

      it('should validate LogoutRequest to Session Participant', function () {
        expect(sessionParticipantLogoutRequest).to.exist;
        expect(xmlhelper.getIssueInstant(sessionParticipantLogoutRequest)).to.exist;
        expect(xmlhelper.getDestination(sessionParticipantLogoutRequest)).to.equal(sessionParticipant2.serviceProviderLogoutURL);
        expect(xmlhelper.getConsent(sessionParticipantLogoutRequest)).to.equal('urn:oasis:names:tc:SAML:2.0:consent:unspecified');
        expect(xmlhelper.getElementText(sessionParticipantLogoutRequest, 'Issuer')).to.equal(samlIdPIssuer);
        expect(xmlhelper.getElementText(sessionParticipantLogoutRequest, 'NameID')).to.equal(sessionParticipant2.nameID);
        expect(xmlhelper.getElementText(sessionParticipantLogoutRequest, 'samlp:SessionIndex')).to.equal(sessionParticipant2.sessionIndex);
      });

      it('should validate LogoutRequest signature', function () {
        expect(SAMLRequest).to.exist;
        expect(sessionParticipantLogoutRequestRelayState).to.exist;
        expect(sessionParticipantLogoutRequestSigAlg).to.exist;
        expect(sessionParticipantLogoutRequestSignature).to.exist;

        var params =  {
          query: {
            SAMLRequest: SAMLRequest,
            RelayState: sessionParticipantLogoutRequestRelayState,
            SigAlg: sessionParticipantLogoutRequestSigAlg,
            Signature: sessionParticipantLogoutRequestSignature
          }
        }; 

        expect(utils.validateSignature(params, "LOGOUT_REQUEST", sessionParticipantLogoutRequest, { signingCert: server.credentials.cert.toString(), deflate: true })).to.be.undefined;
      });

      describe('should send Session Participant LogoutResponse to the SAML IdP', function () {
        var SAMLResponse;
        var sessionParticipantLogoutResponse;
        var sessionParticipantLogoutResponseRelayState;
        var sessionParticipantLogoutResponseSigAlg;
        var sessionParticipantLogoutResponseSignature;

        before(function (done) {
          // SAMLResponse: base64 encoded + deflated + URLEncoded
          // Signature: URLEncoded
          // SigAlg: URLEncoded
          // 
          // <samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
          //   ID="_2bba6ea5e677d807f06a"
          //   InResponseTo="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318"
          //   Version="2.0"
          //   IssueInstant="2016-12-16T13:37:57Z"
          //   Destination="http://localhost:5050/logout">
          //     <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">https://foobarsupport.example.com</saml:Issuer>
          //     <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
          //     </samlp:Status>
          // </samlp:LogoutResponse>
          request.get({
            jar: request.jar(),
            followRedirect: false,
            uri: 'http://localhost:5050/logout?SAMLResponse=fZLBasMwDIbvg71D8D2NnTZJZ5rAWC%2BF7rKWHnYZjquuBccylgN9%2FCWBQpKN6WAQv6RP%2FtGGVGOc3OM3tuEDyKEliO6NsSQHqWSttxIV3Uha1QDJoOXh9X0v0wWXzmNAjYY9P0Wj2G1L9pXWtcpBZZAXxXnNiwvP1bzOPpBHLFnP83Gacl3wDGItukcIyOOXtVrFoC%2BrutawWor1bMwJPN3QlqxbaU4gamFnKSgbOp2LPBZpLPKjWMplIbPic9awBQo3q8Iw7xqCk0liUCtzRQoy4xnv0t4sVk0bo2jTf0AORD%2By8H8HFRH4nsaqnkYd7oJYK0%2Btc%2BjDAu6qcQYWGptNMiL8jXfyEFRoqZpkb3iG6KRMC%2F8vQ0O1PLRaAxFLfjOSCWQsP6TpKVU%2F&Signature=taHlDQSc0bYUYw%2Bcekm8gt3Y4Pk%2BftEIo5dBXaAW5%2BpyNUW9lb85cvt7QkVchIfY8HH4wa8NbtO6CD1yFLMQrYKLpENW1p6NbkedimbrvaWyobSqccQff81cBe5EMN%2BYuFQetKZhmsdt1pINdsW3W068mZeL6AJgxaxI45UaZzD7Dit%2BmdLzo1p7AnNa1Fr14kFpr2dj94kP32layrMPrgFZpBa4h%2FxqVwKJJ5EXflqEturBrU1zISFY9A7cateqQF89yLX5MQ8wXKXwALBKT2MczPkjLqC8X0ejDgBwBAbeE31cM39Ri%2B20s4JfcCxPnT%2BUVTgPs2Q%2BTPgZVSBBlA%3D%3D&RelayState=123&SigAlg=http%3A%2F%2Fwww.w3.org%2F2000%2F09%2Fxmldsig%23rsa-sha1'
          }, function (err, response) {
            if (err) { return done(err); }

            expect(response.statusCode).to.equal(302);
            var qs = require('querystring');

            var i = response.headers.location.indexOf('?');
            var completeQueryString = response.headers.location.substr(i+1);
            var parsedQueryString = qs.parse(completeQueryString);

            SAMLResponse = parsedQueryString.SAMLResponse;
            sessionParticipantLogoutResponseRelayState = parsedQueryString.RelayState;
            sessionParticipantLogoutResponseSigAlg = parsedQueryString.SigAlg;
            sessionParticipantLogoutResponseSignature = parsedQueryString.Signature;

            zlib.inflateRaw(new Buffer(SAMLResponse, 'base64'), function (err, decodedAndInflated) {
              if(err) return done(err);
              sessionParticipantLogoutResponse = decodedAndInflated.toString();

              done();
            });
          });
        });

        it('should validate LogoutResponse to the Session Participant that initiated the logout', function () {
          expect(sessionParticipantLogoutResponse).to.exist;
          expect(xmlhelper.getIssueInstant(sessionParticipantLogoutResponse)).to.exist;
          expect(xmlhelper.getDestination(sessionParticipantLogoutResponse)).to.equal(sessionParticipant1.serviceProviderLogoutURL); 
          expect(xmlhelper.getInResponseTo(sessionParticipantLogoutResponse)).to.equal('samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318');
          expect(xmlhelper.getIssuer(sessionParticipantLogoutResponse)).to.equal(samlIdPIssuer);
        });

        it('should respond with a Success value', function () {
          var signedAssertion = /(<samlp:StatusCode.*\/>)/.exec(sessionParticipantLogoutResponse)[1];
          var doc = new xmldom.DOMParser().parseFromString(signedAssertion);
          var logoutResultValue = doc.documentElement.getAttribute('Value');
          expect(logoutResultValue).to.equal('urn:oasis:names:tc:SAML:2.0:status:Success');
        });

        it('should validate LogoutResponse signature', function () {
          expect(SAMLResponse).to.exist;
          expect(sessionParticipantLogoutResponseRelayState).to.exist;
          expect(sessionParticipantLogoutResponseSigAlg).to.exist;
          expect(sessionParticipantLogoutResponseSignature).to.exist;

          var params =  {
            query: {
              SAMLResponse: SAMLResponse,
              RelayState: sessionParticipantLogoutResponseRelayState,
              SigAlg: sessionParticipantLogoutResponseSigAlg,
              Signature: sessionParticipantLogoutResponseSignature
            }
          };

          expect(utils.validateSignature(params, "LOGOUT_RESPONSE", sessionParticipantLogoutResponse, { signingCert: server.credentials.cert.toString(), deflate: true })).to.be.undefined;        
        });

        it('should remove session from sessions array', function () {
          expect(sessions.length).to.equal(0);
        });
      });
    });
  });

  describe('HTTP POST', function () {
    describe('SP initiated - Should fail if No Issuer is present', function () {
      var logoutResultValue;

      before(function () {
        testStore.clear();

        sessions.splice(0);
        sessions.push({
          serviceProviderId : 'https://foobarsupport.zendesk.com',
          nameID: 'foo@example.com',
          sessionIndex: '1',
          serviceProviderLogoutURL: 'https://example.com/logout',
          cert: sp1_credentials.cert
        });
      });

      // SAMLRequest: base64 encoded + deflated + URLEncoded
      // Signature: URLEncoded
      // SigAlg: URLEncoded

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>https://foobarsupport.zendesk.com</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>1</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        request.post({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout',
          json: true,
          body: {
            SAMLRequest: 'PHNhbWxwOkxvZ291dFJlcXVlc3QgeG1sbnM6c2FtbHA9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpwcm90b2NvbCIgeG1sbnM6c2FtbD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmFzc2VydGlvbiIgSUQ9InBmeDRjNTk4YmRhLWQ0ZWYtNTdkOC04NDM1LTk1ZmNmYzE4Y2I0NyIgSXNzdWVJbnN0YW50PSIyMDE2LTEyLTEzVDE4OjAxOjEyWiIgVmVyc2lvbj0iMi4wIj48ZHM6U2lnbmF0dXJlIHhtbG5zOmRzPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj4NCiAgPGRzOlNpZ25lZEluZm8+PGRzOkNhbm9uaWNhbGl6YXRpb25NZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiLz4NCiAgICA8ZHM6U2lnbmF0dXJlTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3JzYS1zaGExIi8+DQogIDxkczpSZWZlcmVuY2UgVVJJPSIjcGZ4NGM1OThiZGEtZDRlZi01N2Q4LTg0MzUtOTVmY2ZjMThjYjQ3Ij48ZHM6VHJhbnNmb3Jtcz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI2VudmVsb3BlZC1zaWduYXR1cmUiLz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PC9kczpUcmFuc2Zvcm1zPjxkczpEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjc2hhMSIvPjxkczpEaWdlc3RWYWx1ZT5oakVEWXBPeU96SnBlMzZkcUFLUFRFMENFYXc9PC9kczpEaWdlc3RWYWx1ZT48L2RzOlJlZmVyZW5jZT48L2RzOlNpZ25lZEluZm8+PGRzOlNpZ25hdHVyZVZhbHVlPmU4TDJOeEx4RjJwMjYrU0NUZnQyMnNja2F1emk5aXlHNTNwRkgvaFlqUEZ5SFU2eTRjcjN0bnFzZklzWHlTR0xwaHUvam9nMWRTVVRFMWpxV0s3U0pZeVJFK1hOM1pwb2I0cDQ3eFAxZGZveFhSd2lNQXRab1hWaWpFYXp1QmxteEZCRjV5dTl6cnFMcFlsY1lRMWRSdmY5dkp0bzVHOXNES3VaeXZFNkVxNG8rZDRPNW9iUmxpWDE5dGovMEFIUzNtcHJOR0QwVlYvU3BhUzVXMzZqMEM3aW4zNG5JRHpBdUc2RUJXVkp1SllzQXp3R0wwOVV6TlhzVTNuMVZIaHhaeUN5Zlo2TEJFNFJvc3ZvaTNiZzZ5cE56dXVFek82bGxndlFRRnFiS1h4NmpGT2I2WU1LWXRMdytobWMyZUlmazBvOUVaSzBUaTlMYU93M09oSU5rUT09PC9kczpTaWduYXR1cmVWYWx1ZT4NCjxkczpLZXlJbmZvPjxkczpYNTA5RGF0YS8+PC9kczpLZXlJbmZvPjwvZHM6U2lnbmF0dXJlPg0KICAgICAgICA8c2FtbDpOYW1lSUQgRm9ybWF0PSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjE6bmFtZWlkLWZvcm1hdDplbWFpbEFkZHJlc3MiPmZvb0BleGFtcGxlLmNvbTwvc2FtbDpOYW1lSUQ+DQogICAgICAgIDxzYW1sOlNlc3Npb25JbmRleD4xPC9zYW1sOlNlc3Npb25JbmRleD4NCiAgICAgIDwvc2FtbHA6TG9nb3V0UmVxdWVzdD4=',
            RelayState: '123'
          }
        }, function (err, response){
          if (err) { return done(err); }
          expect(response.statusCode).to.equal(400);
          logoutResultValue = response.body;

          done();
        });
      });

      it('should respond with an Error message', function () {
        expect(logoutResultValue).to.equal('SAML Request with no issuer. Issuer is a mandatory element.');
      });
    });

    describe('SP initiated - 1 Session Participant', function () {
      var logoutResultValue, relayState, samlResponse;

      before(function () {
        testStore.clear();

        sessions.splice(0);
        sessions.push({
          serviceProviderId : 'https://foobarsupport.zendesk.com',
          nameID: 'foo@example.com',
          sessionIndex: '1',
          serviceProviderLogoutURL: 'https://example.com/logout',
          cert: sp1_credentials.cert
        });
      });

      // SAMLRequest: base64 encoded + deflated + URLEncoded
      // Signature: URLEncoded
      // SigAlg: URLEncoded

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>https://foobarsupport.zendesk.com</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>1</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        request.post({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout',
          json: true,
          body: {
            SAMLRequest: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+DQo8c2FtbHA6TG9nb3V0UmVxdWVzdCB4bWxuczpzYW1scD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnByb3RvY29sIiB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBJRD0icGZ4NmZlNjU3ZTMtMWE3Zi04OTNlLWY2OTAtZjdmYzUxNjJlYTExIiBJc3N1ZUluc3RhbnQ9IjIwMTYtMTItMTNUMTg6MDE6MTJaIiBWZXJzaW9uPSIyLjAiPg0KICAgICAgICA8c2FtbDpJc3N1ZXI+aHR0cHM6Ly9mb29iYXJzdXBwb3J0LnplbmRlc2suY29tPC9zYW1sOklzc3Vlcj48ZHM6U2lnbmF0dXJlIHhtbG5zOmRzPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj4NCiAgPGRzOlNpZ25lZEluZm8+PGRzOkNhbm9uaWNhbGl6YXRpb25NZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiLz4NCiAgICA8ZHM6U2lnbmF0dXJlTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3JzYS1zaGExIi8+DQogIDxkczpSZWZlcmVuY2UgVVJJPSIjcGZ4NmZlNjU3ZTMtMWE3Zi04OTNlLWY2OTAtZjdmYzUxNjJlYTExIj48ZHM6VHJhbnNmb3Jtcz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI2VudmVsb3BlZC1zaWduYXR1cmUiLz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PC9kczpUcmFuc2Zvcm1zPjxkczpEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjc2hhMSIvPjxkczpEaWdlc3RWYWx1ZT55SnpIbmRqL3NuaVJzTG1kcHFSZ0Yvdmp6L0k9PC9kczpEaWdlc3RWYWx1ZT48L2RzOlJlZmVyZW5jZT48L2RzOlNpZ25lZEluZm8+PGRzOlNpZ25hdHVyZVZhbHVlPk56bU42R0RLcHNpMVU4NndaTXNjWjY2aExHNDVhMzhhMGhvaCtpdFdCTWQzNS9RMnF1Y2N2NEJaTGhSbU1xYmFIL3l4VnZ4bWUvWXExR24xbEkrVlpwZkZsYURXQnZTcXUxdWJVemVEbEtVUDdHUmVnakNSTFErSkhxZnQ2aHRDdENQdkttQ0NTaVNEVlZydmcvc0ZLVXBuVDhPWEhkK25ENDBLSVQ4NHQ2OERiM2pTN3g2amx6VDMzYk1Vdm83dVNFUDVnSnFUbG9RMVVWY280WmszUGVxK0tDOWF6TUFkVHVnMWZZRDJXVWtXOEZCd084b1ZBUWpDMGo4VkVyVVpiUUpRS2hhdTMxcjNVcU1VUExNS0NJaFZxZ0tPRVd6MWt1a1NWY2MzdTJjR0owT1FJU093N0xQbkRDSTdPclVMaGU4NEJESTMzR01JMDNXazFMNG5Mdz09PC9kczpTaWduYXR1cmVWYWx1ZT4NCjxkczpLZXlJbmZvPjxkczpYNTA5RGF0YS8+PC9kczpLZXlJbmZvPjwvZHM6U2lnbmF0dXJlPg0KICAgICAgICA8c2FtbDpOYW1lSUQgRm9ybWF0PSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjE6bmFtZWlkLWZvcm1hdDplbWFpbEFkZHJlc3MiPmZvb0BleGFtcGxlLmNvbTwvc2FtbDpOYW1lSUQ+DQogICAgICAgIDxzYW1sOlNlc3Npb25JbmRleD4xPC9zYW1sOlNlc3Npb25JbmRleD4NCiAgICAgIDwvc2FtbHA6TG9nb3V0UmVxdWVzdD4=',
            RelayState: '123'
          }
        }, function (err, response){
          if (err) { return done(err); }
          expect(response.statusCode).to.equal(200);
          $ = cheerio.load(response.body);
          var SAMLResponse = $('input[name="SAMLResponse"]').attr('value');
          relayState = $('input[name="RelayState"]').attr('value');        
          samlResponse = new Buffer(SAMLResponse, 'base64');
          signedAssertion = /(<samlp:StatusCode.*\/>)/.exec(samlResponse)[1];
          var doc = new xmldom.DOMParser().parseFromString(signedAssertion);
          logoutResultValue = doc.documentElement.getAttribute('Value');
          done();
        });
      });

      it('should respond with a Success value', function () {
        expect(logoutResultValue).to.equal('urn:oasis:names:tc:SAML:2.0:status:Success');
      });

      it('should include RelayState', function () {
        expect(relayState).to.equal('123');
      });

      it('should remove session from sessions array', function () {
        expect(sessions.length).to.equal(0);
      });
    });

    describe('SP initiated - 2 Session Participants', function () {
      var SAMLRequest;
      var sessionParticipantLogoutRequest;
      var sessionParticipantLogoutRequestRelayState;

      var sessionParticipant1 = { // Logout Initiator
        serviceProviderId : 'https://foobarsupport.zendesk.com', // Issuer
        nameID: 'foo@example.com',
        sessionIndex: '1',
        serviceProviderLogoutURL: 'https://foobarsupport.zendesk.com/logout',
        cert: sp1_credentials.cert // SP1 public Cert
      };

      var sessionParticipant2 = {
        serviceProviderId : 'https://foobarsupport.example.com', // Issuer
        nameID: 'bar@example.com',
        sessionIndex: '2',
        serviceProviderLogoutURL: 'https://foobarsupport.example.com/logout',
        cert: sp2_credentials.cert // SP2 public Cert
      };

      before(function () {
        testStore.clear();

        sessions.splice(0);
        sessions.push(sessionParticipant1);
        sessions.push(sessionParticipant2);
      });

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>https://foobarsupport.zendesk.com</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>1</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        // Session Participant 1 initiating logout. Sending LogoutRequest to IdP
        request.post({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout',
          json: true,
          body: {
            SAMLRequest: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+DQo8c2FtbHA6TG9nb3V0UmVxdWVzdCB4bWxuczpzYW1scD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnByb3RvY29sIiB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBJRD0icGZ4NmZlNjU3ZTMtMWE3Zi04OTNlLWY2OTAtZjdmYzUxNjJlYTExIiBJc3N1ZUluc3RhbnQ9IjIwMTYtMTItMTNUMTg6MDE6MTJaIiBWZXJzaW9uPSIyLjAiPg0KICAgICAgICA8c2FtbDpJc3N1ZXI+aHR0cHM6Ly9mb29iYXJzdXBwb3J0LnplbmRlc2suY29tPC9zYW1sOklzc3Vlcj48ZHM6U2lnbmF0dXJlIHhtbG5zOmRzPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj4NCiAgPGRzOlNpZ25lZEluZm8+PGRzOkNhbm9uaWNhbGl6YXRpb25NZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiLz4NCiAgICA8ZHM6U2lnbmF0dXJlTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3JzYS1zaGExIi8+DQogIDxkczpSZWZlcmVuY2UgVVJJPSIjcGZ4NmZlNjU3ZTMtMWE3Zi04OTNlLWY2OTAtZjdmYzUxNjJlYTExIj48ZHM6VHJhbnNmb3Jtcz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI2VudmVsb3BlZC1zaWduYXR1cmUiLz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PC9kczpUcmFuc2Zvcm1zPjxkczpEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjc2hhMSIvPjxkczpEaWdlc3RWYWx1ZT55SnpIbmRqL3NuaVJzTG1kcHFSZ0Yvdmp6L0k9PC9kczpEaWdlc3RWYWx1ZT48L2RzOlJlZmVyZW5jZT48L2RzOlNpZ25lZEluZm8+PGRzOlNpZ25hdHVyZVZhbHVlPk56bU42R0RLcHNpMVU4NndaTXNjWjY2aExHNDVhMzhhMGhvaCtpdFdCTWQzNS9RMnF1Y2N2NEJaTGhSbU1xYmFIL3l4VnZ4bWUvWXExR24xbEkrVlpwZkZsYURXQnZTcXUxdWJVemVEbEtVUDdHUmVnakNSTFErSkhxZnQ2aHRDdENQdkttQ0NTaVNEVlZydmcvc0ZLVXBuVDhPWEhkK25ENDBLSVQ4NHQ2OERiM2pTN3g2amx6VDMzYk1Vdm83dVNFUDVnSnFUbG9RMVVWY280WmszUGVxK0tDOWF6TUFkVHVnMWZZRDJXVWtXOEZCd084b1ZBUWpDMGo4VkVyVVpiUUpRS2hhdTMxcjNVcU1VUExNS0NJaFZxZ0tPRVd6MWt1a1NWY2MzdTJjR0owT1FJU093N0xQbkRDSTdPclVMaGU4NEJESTMzR01JMDNXazFMNG5Mdz09PC9kczpTaWduYXR1cmVWYWx1ZT4NCjxkczpLZXlJbmZvPjxkczpYNTA5RGF0YS8+PC9kczpLZXlJbmZvPjwvZHM6U2lnbmF0dXJlPg0KICAgICAgICA8c2FtbDpOYW1lSUQgRm9ybWF0PSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjE6bmFtZWlkLWZvcm1hdDplbWFpbEFkZHJlc3MiPmZvb0BleGFtcGxlLmNvbTwvc2FtbDpOYW1lSUQ+DQogICAgICAgIDxzYW1sOlNlc3Npb25JbmRleD4xPC9zYW1sOlNlc3Npb25JbmRleD4NCiAgICAgIDwvc2FtbHA6TG9nb3V0UmVxdWVzdD4=',
            RelayState: '123'
          }
        }, function (err, response){
          if(err) return done(err);
          // The response contains an HTTP Form that will be submitted to Session Participant 2
          // The Form includes a LogoutRequest signed by the IdP
          expect(response.statusCode).to.equal(200);
          $ = cheerio.load(response.body);
          SAMLRequest = $('input[name="SAMLRequest"]').attr('value');
          sessionParticipantLogoutRequestRelayState = $('input[name="RelayState"]').attr('value');
          sessionParticipantLogoutRequest = new Buffer(SAMLRequest, 'base64').toString();
          done();
        });
      });

      it('should validate LogoutRequest to Session Participant', function () {
        expect(sessionParticipantLogoutRequest).to.exist;
        expect(xmlhelper.getIssueInstant(sessionParticipantLogoutRequest)).to.exist;
        expect(xmlhelper.getDestination(sessionParticipantLogoutRequest)).to.equal(sessionParticipant2.serviceProviderLogoutURL);
        expect(xmlhelper.getConsent(sessionParticipantLogoutRequest)).to.equal('urn:oasis:names:tc:SAML:2.0:consent:unspecified');
        expect(xmlhelper.getElementText(sessionParticipantLogoutRequest, 'Issuer')).to.equal(samlIdPIssuer);
        expect(xmlhelper.getElementText(sessionParticipantLogoutRequest, 'NameID')).to.equal(sessionParticipant2.nameID);
        expect(xmlhelper.getElementText(sessionParticipantLogoutRequest, 'samlp:SessionIndex')).to.equal(sessionParticipant2.sessionIndex);
      });

      it('should validate LogoutRequest signature', function () {
        expect(SAMLRequest).to.exist;
        expect(sessionParticipantLogoutRequestRelayState).to.exist;

        // TODO: Review as we need to merge validation methods
        var doc = new xmldom.DOMParser().parseFromString(sessionParticipantLogoutRequest);        
        expect(utils.validateSignature({body : { SAMLRequest: SAMLRequest }}, "LOGOUT_REQUEST", doc, { signingCert: server.credentials.cert })).to.be.undefined;
      });

      describe('should send Session Participant 2 LogoutResponse to the SAML IdP', function () {
        var SAMLResponse;
        var sessionParticipantLogoutResponse;
        var sessionParticipantLogoutResponseRelayState;

        before(function (done) {
          // <samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
          //   ID="_2bba6ea5e677d807f06a"
          //   InResponseTo="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318"
          //   Version="2.0"
          //   IssueInstant="2016-12-16T13:37:57Z"
          //   Destination="http://localhost:5050/logout">
          //     <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">https://foobarsupport.example.com</saml:Issuer>
          //     <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
          //     </samlp:Status>
          // </samlp:LogoutResponse>
          request.post({
            jar: request.jar(),
            followRedirect: false,
            uri: 'http://localhost:5050/logout',
            json: true,
            body: {
              SAMLResponse: 'PHNhbWxwOkxvZ291dFJlc3BvbnNlIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6cHJvdG9jb2wiIElEPSJfMmJiYTZlYTVlNjc3ZDgwN2YwNmEiIEluUmVzcG9uc2VUbz0ic2FtbHItMjIwYzcwNWUtYzE1ZS0xMWU2LTk4YTQtZWNmNGJiY2U0MzE4IiBWZXJzaW9uPSIyLjAiIElzc3VlSW5zdGFudD0iMjAxNi0xMi0xNlQxMzozNzo1N1oiIERlc3RpbmF0aW9uPSJodHRwOi8vbG9jYWxob3N0OjUwNTAvbG9nb3V0Ij4KICAgIDxzYW1sOklzc3VlciB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIj5odHRwczovL2Zvb2JhcnN1cHBvcnQuZXhhbXBsZS5jb208L3NhbWw6SXNzdWVyPjxkczpTaWduYXR1cmUgeG1sbnM6ZHM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxkczpTaWduZWRJbmZvPjxkczpDYW5vbmljYWxpemF0aW9uTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PGRzOlNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMDQveG1sZHNpZy1tb3JlI3JzYS1zaGEyNTYiLz48ZHM6UmVmZXJlbmNlIFVSST0iI18yYmJhNmVhNWU2NzdkODA3ZjA2YSI+PGRzOlRyYW5zZm9ybXM+PGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNlbnZlbG9wZWQtc2lnbmF0dXJlIi8+PGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIvPjwvZHM6VHJhbnNmb3Jtcz48ZHM6RGlnZXN0TWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjc2hhMjU2Ii8+PGRzOkRpZ2VzdFZhbHVlPkxXUmUrbGNNR0VRYTlPYjlsc0hpUk5Ob29pUDgyM2JwVFA2OFVXMUdRR0U9PC9kczpEaWdlc3RWYWx1ZT48L2RzOlJlZmVyZW5jZT48L2RzOlNpZ25lZEluZm8+PGRzOlNpZ25hdHVyZVZhbHVlPlAxeUdBaGxJZEQvZUFYWERUb0JSQ3VXekxneldxaEZpQURqMDRLcmMvSmNaNlZwVjJhVXpSWjJDR21SOUZaNVdXZlU2VVB0SG5VYU1iSVR6NjZFSEdBaCtNcC9JajNJWU1qeVltWnJtTDhJSlFZWHkzMTFwU2REQnU4REJJUm5aQkpLSG5EV0VtT0doS2NJcHhTa1hveVd3NlpCK090VWh5d3dGKzVPMXh5cnk0alJQODlxV28wN2M0MzZaMHNkbWNhZkRkU1NpeTdkMVRVMUphN0VUYnhBYnVaSFRwUDNYSzFLeTdrNUZWU3ZxcCtYc2xsVTBTWTlkMWhFd0ZlSEpnOWdCa2xxVm1iYUdGV0FhK0xZTGoxWGd2KzBnejdWa2ptVTJUV2ZZQVE2MU9vbkJ5TWpKcWFqbk5oWkorODN6L2RLbWZSd200V3FUK0hwVFVJcUhaQT09PC9kczpTaWduYXR1cmVWYWx1ZT48ZHM6S2V5SW5mbz48ZHM6WDUwOURhdGEvPjwvZHM6S2V5SW5mbz48L2RzOlNpZ25hdHVyZT4KICAgIDxzYW1scDpTdGF0dXM+PHNhbWxwOlN0YXR1c0NvZGUgVmFsdWU9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpzdGF0dXM6U3VjY2VzcyIvPgogICAgPC9zYW1scDpTdGF0dXM+Cjwvc2FtbHA6TG9nb3V0UmVzcG9uc2U+',
              RelayState: '123'
            }
          }, function (err, response) {
            if (err) { return done(err); }
            $ = cheerio.load(response.body);
            SAMLResponse = $('input[name="SAMLResponse"]').attr('value');
            sessionParticipantLogoutResponseRelayState = $('input[name="RelayState"]').attr('value');        
            sessionParticipantLogoutResponse = new Buffer(SAMLResponse, 'base64').toString();
            done();
          });
        });

        it('should validate LogoutResponse to the Session Participant that initiated the logout', function () {
          expect(sessionParticipantLogoutResponse).to.exist;
          expect(xmlhelper.getIssueInstant(sessionParticipantLogoutResponse)).to.exist;
          expect(xmlhelper.getDestination(sessionParticipantLogoutResponse)).to.equal(sessionParticipant1.serviceProviderLogoutURL); 
          expect(xmlhelper.getInResponseTo(sessionParticipantLogoutResponse)).to.equal('pfx6fe657e3-1a7f-893e-f690-f7fc5162ea11');
          expect(xmlhelper.getIssuer(sessionParticipantLogoutResponse)).to.equal(samlIdPIssuer);
        });

        it('should respond with a Success value', function () {
          var signedAssertion = /(<samlp:StatusCode.*\/>)/.exec(new Buffer(SAMLResponse, 'base64'))[1];
          var doc = new xmldom.DOMParser().parseFromString(signedAssertion);
          var logoutResultValue = doc.documentElement.getAttribute('Value');
          expect(logoutResultValue).to.equal('urn:oasis:names:tc:SAML:2.0:status:Success');
        });

        it('should validate LogoutResponse signature', function () {
          expect(SAMLResponse).to.exist;
          expect(sessionParticipantLogoutResponseRelayState).to.exist;
          
          // TODO: Review as we need to merge validation methods          
          var doc = new xmldom.DOMParser().parseFromString(sessionParticipantLogoutResponse);                  
          expect(utils.validateSignature({body : { SAMLResponse: SAMLResponse }}, "LOGOUT_RESPONSE", doc, { signingCert: server.credentials.cert })).to.be.undefined;
        });

        it('should remove session from sessions array', function () {
          expect(sessions.length).to.equal(0);
        });
      });
    });

    describe('SP Initiated - HTTP POST - with Issuer not an URL', function(){
      var samlResponse, action, relayState, logoutResultValue;

      before(function () {
        testStore.clear();

        sessions.splice(0);
        sessions.push({
          serviceProviderId : 'an-issuer',
          nameID: 'foo@example.com',
          sessionIndex: '1',
          serviceProviderLogoutURL: 'https://example.com/logout',
          cert: sp1_credentials.cert
        });
      });

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>an-issuer</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>3</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        request.post({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout',
          json: true,
          body: {
            SAMLRequest: 'PHNhbWxwOkxvZ291dFJlcXVlc3QgeG1sbnM6c2FtbHA9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpwcm90b2NvbCIgeG1sbnM6c2FtbD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOmFzc2VydGlvbiIgSUQ9InBmeGEwOWQ1MmZiLTZkODAtYjhlYS1jMWE2LTBhMzk5YjYxNjY4MSIgSXNzdWVJbnN0YW50PSIyMDE2LTEyLTEzVDE4OjAxOjEyWiIgVmVyc2lvbj0iMi4wIj4NCiAgICAgICAgPHNhbWw6SXNzdWVyPmFuLWlzc3Vlcjwvc2FtbDpJc3N1ZXI+PGRzOlNpZ25hdHVyZSB4bWxuczpkcz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnIyI+DQogIDxkczpTaWduZWRJbmZvPjxkczpDYW5vbmljYWxpemF0aW9uTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+DQogICAgPGRzOlNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNyc2Etc2hhMSIvPg0KICA8ZHM6UmVmZXJlbmNlIFVSST0iI3BmeGEwOWQ1MmZiLTZkODAtYjhlYS1jMWE2LTBhMzk5YjYxNjY4MSI+PGRzOlRyYW5zZm9ybXM+PGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNlbnZlbG9wZWQtc2lnbmF0dXJlIi8+PGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIvPjwvZHM6VHJhbnNmb3Jtcz48ZHM6RGlnZXN0TWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3NoYTEiLz48ZHM6RGlnZXN0VmFsdWU+MGRlQ2ZxbFlhcVkxbGQ2YlVxcmpidHV3SUdVPTwvZHM6RGlnZXN0VmFsdWU+PC9kczpSZWZlcmVuY2U+PC9kczpTaWduZWRJbmZvPjxkczpTaWduYXR1cmVWYWx1ZT5nTSszUHBwREFGdk1YSnVoVnIvMTRqb1hRWS9wRjIyc1VzMks0VjNCSmpNa21vUU4xL0VVbENrTEc3NXhIdGs5MWd3OE1HNUpySEgyZkZ3V3lyYWxmSXZ5Q281WmQ2aS9SeHdRTlo0bkpncGxWRVRDd09LK3ByNk5QM3hhMHpqWEJld255OWlHZXI2OFQ2dUFVTVQweTZJTUpXbEZGYmhaRW1lWkJ3cE1rVWJjU2VsRHNzSFRvYUR4RFZBdmhOR3pTU1VKd1FyWkYvVjZDOFJkdFRVSUxvZXJzRTVzcktVQVJ5SjZzbWlKck9vVm4reHJOWDBCM0lvMjIyczZSV1d1VU9ibVVsQWRnUzYyb1VzSFV0LzBoSXlvMUJ4c2VMaDd4Nm1kVXY0M1BGTGJqWVZ6eXdTbElIenFEVW5udHV2c0ozTVhKREw4dEJvUFNlbXdPV1g4Z0E9PTwvZHM6U2lnbmF0dXJlVmFsdWU+DQo8ZHM6S2V5SW5mbz48ZHM6WDUwOURhdGEvPjwvZHM6S2V5SW5mbz48L2RzOlNpZ25hdHVyZT4NCiAgICAgICAgPHNhbWw6TmFtZUlEIEZvcm1hdD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6MS4xOm5hbWVpZC1mb3JtYXQ6ZW1haWxBZGRyZXNzIj5mb29AZXhhbXBsZS5jb208L3NhbWw6TmFtZUlEPg0KICAgICAgICA8c2FtbDpTZXNzaW9uSW5kZXg+MTwvc2FtbDpTZXNzaW9uSW5kZXg+DQogICAgICA8L3NhbWxwOkxvZ291dFJlcXVlc3Q+',
            RelayState: '123'
          }
        }, function (err, response){
          if(err) return done(err);
          expect(response.statusCode).to.equal(200);
          $ = cheerio.load(response.body);
          var SAMLResponse = $('input[name="SAMLResponse"]').attr('value');
          relayState = $('input[name="RelayState"]').attr('value'); 
          action = $('form').attr('action');                         
          samlResponse = new Buffer(SAMLResponse, 'base64');
          signedAssertion = /(<samlp:StatusCode.*\/>)/.exec(samlResponse)[1];
          var doc = new xmldom.DOMParser().parseFromString(signedAssertion);
          logoutResultValue = doc.documentElement.getAttribute('Value');

          done();
        });
      });

      it('should respond with a Success value', function () {
        expect(logoutResultValue).to.equal('urn:oasis:names:tc:SAML:2.0:status:Success');
      });

      it('should return RelayState', function () {
        expect(relayState).to.equal('123');
      });

      it('should set action to service provider URL', function(){
        expect(action).to.equal('https://example.com/logout');
      });
    });

    describe('SP initiated - 2 Session Participants - Partial Logout with Error on SP', function () {
      var sessionParticipant1 = { // Logout Initiator
        serviceProviderId : 'https://foobarsupport.zendesk.com', // Issuer
        nameID: 'foo@example.com',
        sessionIndex: '1',
        serviceProviderLogoutURL: 'https://foobarsupport.zendesk.com/logout',
        cert: sp1_credentials.cert // SP1 public Cert
      };

      var sessionParticipant2 = {
        serviceProviderId : 'https://foobarsupport.example.com', // Issuer
        nameID: 'bar@example.com',
        sessionIndex: '2',
        serviceProviderLogoutURL: 'https://foobarsupport.example.com/logout',
        cert: sp2_credentials.cert // SP2 public Cert
      };

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>https://foobarsupport.zendesk.com</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>1</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        testStore.clear();

        sessions.splice(0);
        // Two sessions in the IdP
        sessions.push(sessionParticipant1);
        sessions.push(sessionParticipant2);

        // Logout request sent by SP 1 to IdP
        request.post({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout',
          json: true,
          body: {
            SAMLRequest: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+DQo8c2FtbHA6TG9nb3V0UmVxdWVzdCB4bWxuczpzYW1scD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnByb3RvY29sIiB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBJRD0icGZ4NmZlNjU3ZTMtMWE3Zi04OTNlLWY2OTAtZjdmYzUxNjJlYTExIiBJc3N1ZUluc3RhbnQ9IjIwMTYtMTItMTNUMTg6MDE6MTJaIiBWZXJzaW9uPSIyLjAiPg0KICAgICAgICA8c2FtbDpJc3N1ZXI+aHR0cHM6Ly9mb29iYXJzdXBwb3J0LnplbmRlc2suY29tPC9zYW1sOklzc3Vlcj48ZHM6U2lnbmF0dXJlIHhtbG5zOmRzPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj4NCiAgPGRzOlNpZ25lZEluZm8+PGRzOkNhbm9uaWNhbGl6YXRpb25NZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiLz4NCiAgICA8ZHM6U2lnbmF0dXJlTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3JzYS1zaGExIi8+DQogIDxkczpSZWZlcmVuY2UgVVJJPSIjcGZ4NmZlNjU3ZTMtMWE3Zi04OTNlLWY2OTAtZjdmYzUxNjJlYTExIj48ZHM6VHJhbnNmb3Jtcz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI2VudmVsb3BlZC1zaWduYXR1cmUiLz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PC9kczpUcmFuc2Zvcm1zPjxkczpEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjc2hhMSIvPjxkczpEaWdlc3RWYWx1ZT55SnpIbmRqL3NuaVJzTG1kcHFSZ0Yvdmp6L0k9PC9kczpEaWdlc3RWYWx1ZT48L2RzOlJlZmVyZW5jZT48L2RzOlNpZ25lZEluZm8+PGRzOlNpZ25hdHVyZVZhbHVlPk56bU42R0RLcHNpMVU4NndaTXNjWjY2aExHNDVhMzhhMGhvaCtpdFdCTWQzNS9RMnF1Y2N2NEJaTGhSbU1xYmFIL3l4VnZ4bWUvWXExR24xbEkrVlpwZkZsYURXQnZTcXUxdWJVemVEbEtVUDdHUmVnakNSTFErSkhxZnQ2aHRDdENQdkttQ0NTaVNEVlZydmcvc0ZLVXBuVDhPWEhkK25ENDBLSVQ4NHQ2OERiM2pTN3g2amx6VDMzYk1Vdm83dVNFUDVnSnFUbG9RMVVWY280WmszUGVxK0tDOWF6TUFkVHVnMWZZRDJXVWtXOEZCd084b1ZBUWpDMGo4VkVyVVpiUUpRS2hhdTMxcjNVcU1VUExNS0NJaFZxZ0tPRVd6MWt1a1NWY2MzdTJjR0owT1FJU093N0xQbkRDSTdPclVMaGU4NEJESTMzR01JMDNXazFMNG5Mdz09PC9kczpTaWduYXR1cmVWYWx1ZT4NCjxkczpLZXlJbmZvPjxkczpYNTA5RGF0YS8+PC9kczpLZXlJbmZvPjwvZHM6U2lnbmF0dXJlPg0KICAgICAgICA8c2FtbDpOYW1lSUQgRm9ybWF0PSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjE6bmFtZWlkLWZvcm1hdDplbWFpbEFkZHJlc3MiPmZvb0BleGFtcGxlLmNvbTwvc2FtbDpOYW1lSUQ+DQogICAgICAgIDxzYW1sOlNlc3Npb25JbmRleD4xPC9zYW1sOlNlc3Npb25JbmRleD4NCiAgICAgIDwvc2FtbHA6TG9nb3V0UmVxdWVzdD4=',
            RelayState: '123'
          }
        }, function (err, response){
          if(err) return done(err);
          expect(response.statusCode).to.equal(200);
          $ = cheerio.load(response.body);
          // IDP Sends LogoutRequest to second IDP
          var SAMLRequest = $('input[name="SAMLRequest"]').attr('value');
          expect(SAMLRequest).to.be.ok;
          done();
        });
      });

      describe('should send Session Participant LogoutResponse with error to the SAML IdP', function () {
        var SAMLResponse;
        var sessionParticipantLogoutResponse;
        var sessionParticipantLogoutResponseRelayState;

        before(function (done) {
          // <samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_2bba6ea5e677d807f06a" InResponseTo="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" Version="2.0" IssueInstant="2016-12-16T13:37:57Z" Destination="http://localhost:5050/logout">
          //     <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">https://foobarsupport.example.com</saml:Issuer>
          //     <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Requester"/>
          //     </samlp:Status>
          // </samlp:LogoutResponse>
          request.post({
            jar: request.jar(),
            followRedirect: false,
            uri: 'http://localhost:5050/logout',
            json: true,
            body: {
              SAMLResponse: 'PHNhbWxwOkxvZ291dFJlc3BvbnNlIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6cHJvdG9jb2wiIElEPSJfMmJiYTZlYTVlNjc3ZDgwN2YwNmEiIEluUmVzcG9uc2VUbz0ic2FtbHItMjIwYzcwNWUtYzE1ZS0xMWU2LTk4YTQtZWNmNGJiY2U0MzE4IiBWZXJzaW9uPSIyLjAiIElzc3VlSW5zdGFudD0iMjAxNi0xMi0xNlQxMzozNzo1N1oiIERlc3RpbmF0aW9uPSJodHRwOi8vbG9jYWxob3N0OjUwNTAvbG9nb3V0Ij4KICAgIDxzYW1sOklzc3VlciB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIj5odHRwczovL2Zvb2JhcnN1cHBvcnQuZXhhbXBsZS5jb208L3NhbWw6SXNzdWVyPjxkczpTaWduYXR1cmUgeG1sbnM6ZHM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxkczpTaWduZWRJbmZvPjxkczpDYW5vbmljYWxpemF0aW9uTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PGRzOlNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMDQveG1sZHNpZy1tb3JlI3JzYS1zaGEyNTYiLz48ZHM6UmVmZXJlbmNlIFVSST0iI18yYmJhNmVhNWU2NzdkODA3ZjA2YSI+PGRzOlRyYW5zZm9ybXM+PGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNlbnZlbG9wZWQtc2lnbmF0dXJlIi8+PGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIvPjwvZHM6VHJhbnNmb3Jtcz48ZHM6RGlnZXN0TWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjc2hhMjU2Ii8+PGRzOkRpZ2VzdFZhbHVlPko0cEdYY2RlZnZNa3NHYWhsbnFndUFxcmRwanVSMWgvV0t5eUdoV1R6c0U9PC9kczpEaWdlc3RWYWx1ZT48L2RzOlJlZmVyZW5jZT48L2RzOlNpZ25lZEluZm8+PGRzOlNpZ25hdHVyZVZhbHVlPldxeGN0L05zWGxocU9hY3hwMUVWampFd1FrdGx5dUVKU01mSk1Iem0vVkNGNnFmZ1lLaTk5NzdsRW1wVjJLS3FPeVo0M2FOMmZSaGx5cHRpOWt6RUlOWm01OURKTnlKb0xBVUhua09TMWxsajJlMytjeG03eDIzTjd3ZDNQNHBzNFBvYzl5U2RBK01KWHBTUCtKbFl3T3pOZWwxaERwTVE5dENRSlhZR3FCSmxkdGxzSWd1bFB5TTdoczlyWXNnZ2syQlVxMEJ4VVFVdnlnWkZRUTB5aEh6RXo3OGQ2ek1DQlphQ2VFbEVVN01wUjMwQXZKcVBNa09tdVA1SllmRDJ0ZzI4VmZndnV3a2dXdThiOU1lTUdjaG0xaW41Mm53cVdzcnoxanZrL3daYXdTRjIrVlNJL2VOdzdieWdEQW9XWUljbjRzbENUaXZBVkQ4cTNkZW9DZz09PC9kczpTaWduYXR1cmVWYWx1ZT48ZHM6S2V5SW5mbz48ZHM6WDUwOURhdGEvPjwvZHM6S2V5SW5mbz48L2RzOlNpZ25hdHVyZT4KICAgIDxzYW1scDpTdGF0dXM+PHNhbWxwOlN0YXR1c0NvZGUgVmFsdWU9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpzdGF0dXM6UmVxdWVzdGVyIi8+CiAgICA8L3NhbWxwOlN0YXR1cz4KPC9zYW1scDpMb2dvdXRSZXNwb25zZT4=',
              RelayState: '123'
            }
          }, function (err, response) {
            if (err) { return done(err); }
            expect(response.statusCode).to.equal(200);
            $ = cheerio.load(response.body);
            SAMLResponse = $('input[name="SAMLResponse"]').attr('value');
            sessionParticipantLogoutResponseRelayState = $('input[name="RelayState"]').attr('value');        
            sessionParticipantLogoutResponse = new Buffer(SAMLResponse, 'base64').toString();
            done();
          });
        });

        it('should respond with a partial success value', function () {
          var signedAssertion = /(<samlp:StatusCode.*\/>)/.exec(new Buffer(SAMLResponse, 'base64'))[1];
          var doc = new xmldom.DOMParser().parseFromString(signedAssertion);
          var logoutResultValue = doc.documentElement.getAttribute('Value');
          expect(logoutResultValue).to.equal('urn:oasis:names:tc:SAML:2.0:status:PartialLogout');
        });

        it('should remove session from sessions array', function () {
          expect(sessions.length).to.equal(0);
        });
      });
    });

    describe('SP initiated - 2 Session Participants - Partial Logout with Error on the IdP', function () {
      var SAMLRequest;
      var sessionParticipantLogoutRequest;
      var sessionParticipantLogoutRequestRelayState;

      var sessionParticipant1 = { // Logout Initiator
        serviceProviderId : 'https://foobarsupport.zendesk.com', // Issuer
        nameID: 'foo@example.com',
        sessionIndex: '1',
        serviceProviderLogoutURL: 'https://foobarsupport.zendesk.com/logout',
        cert: sp1_credentials.cert // SP1 public Cert
      };

      var sessionParticipant2 = {
        serviceProviderId : 'https://foobarsupport.example.com', // Issuer
        nameID: 'bar@example.com',
        sessionIndex: '2',
        serviceProviderLogoutURL: 'https://foobarsupport.example.com/logout',
        cert: sp2_credentials.cert // SP2 public Cert
      };

      // <samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318" IssueInstant="2016-12-13T18:01:12Z" Version="2.0">
      //   <saml:Issuer>https://foobarsupport.zendesk.com</saml:Issuer>
      //   <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">foo@example.com</saml:NameID>
      //   <saml:SessionIndex>1</saml:SessionIndex>
      // </samlp:LogoutRequest>
      before(function (done) {
        testStore.clear();
        returnError = true;

        sessions.splice(0);
        sessions.push(sessionParticipant1);
        sessions.push(sessionParticipant2);

        request.post({
          jar: request.jar(),
          followRedirect: false,
          uri: 'http://localhost:5050/logout',
          json: true,
          body: {
            SAMLRequest: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+DQo8c2FtbHA6TG9nb3V0UmVxdWVzdCB4bWxuczpzYW1scD0idXJuOm9hc2lzOm5hbWVzOnRjOlNBTUw6Mi4wOnByb3RvY29sIiB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIiBJRD0icGZ4NmZlNjU3ZTMtMWE3Zi04OTNlLWY2OTAtZjdmYzUxNjJlYTExIiBJc3N1ZUluc3RhbnQ9IjIwMTYtMTItMTNUMTg6MDE6MTJaIiBWZXJzaW9uPSIyLjAiPg0KICAgICAgICA8c2FtbDpJc3N1ZXI+aHR0cHM6Ly9mb29iYXJzdXBwb3J0LnplbmRlc2suY29tPC9zYW1sOklzc3Vlcj48ZHM6U2lnbmF0dXJlIHhtbG5zOmRzPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjIj4NCiAgPGRzOlNpZ25lZEluZm8+PGRzOkNhbm9uaWNhbGl6YXRpb25NZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiLz4NCiAgICA8ZHM6U2lnbmF0dXJlTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3JzYS1zaGExIi8+DQogIDxkczpSZWZlcmVuY2UgVVJJPSIjcGZ4NmZlNjU3ZTMtMWE3Zi04OTNlLWY2OTAtZjdmYzUxNjJlYTExIj48ZHM6VHJhbnNmb3Jtcz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI2VudmVsb3BlZC1zaWduYXR1cmUiLz48ZHM6VHJhbnNmb3JtIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PC9kczpUcmFuc2Zvcm1zPjxkczpEaWdlc3RNZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjc2hhMSIvPjxkczpEaWdlc3RWYWx1ZT55SnpIbmRqL3NuaVJzTG1kcHFSZ0Yvdmp6L0k9PC9kczpEaWdlc3RWYWx1ZT48L2RzOlJlZmVyZW5jZT48L2RzOlNpZ25lZEluZm8+PGRzOlNpZ25hdHVyZVZhbHVlPk56bU42R0RLcHNpMVU4NndaTXNjWjY2aExHNDVhMzhhMGhvaCtpdFdCTWQzNS9RMnF1Y2N2NEJaTGhSbU1xYmFIL3l4VnZ4bWUvWXExR24xbEkrVlpwZkZsYURXQnZTcXUxdWJVemVEbEtVUDdHUmVnakNSTFErSkhxZnQ2aHRDdENQdkttQ0NTaVNEVlZydmcvc0ZLVXBuVDhPWEhkK25ENDBLSVQ4NHQ2OERiM2pTN3g2amx6VDMzYk1Vdm83dVNFUDVnSnFUbG9RMVVWY280WmszUGVxK0tDOWF6TUFkVHVnMWZZRDJXVWtXOEZCd084b1ZBUWpDMGo4VkVyVVpiUUpRS2hhdTMxcjNVcU1VUExNS0NJaFZxZ0tPRVd6MWt1a1NWY2MzdTJjR0owT1FJU093N0xQbkRDSTdPclVMaGU4NEJESTMzR01JMDNXazFMNG5Mdz09PC9kczpTaWduYXR1cmVWYWx1ZT4NCjxkczpLZXlJbmZvPjxkczpYNTA5RGF0YS8+PC9kczpLZXlJbmZvPjwvZHM6U2lnbmF0dXJlPg0KICAgICAgICA8c2FtbDpOYW1lSUQgRm9ybWF0PSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoxLjE6bmFtZWlkLWZvcm1hdDplbWFpbEFkZHJlc3MiPmZvb0BleGFtcGxlLmNvbTwvc2FtbDpOYW1lSUQ+DQogICAgICAgIDxzYW1sOlNlc3Npb25JbmRleD4xPC9zYW1sOlNlc3Npb25JbmRleD4NCiAgICAgIDwvc2FtbHA6TG9nb3V0UmVxdWVzdD4=',
            RelayState: '123'
          }
        }, function (err, response){
          if(err) return done(err);
          expect(response.statusCode).to.equal(200);
          $ = cheerio.load(response.body);
          // 
          SAMLRequest = $('input[name="SAMLRequest"]').attr('value');
          sessionParticipantLogoutRequestRelayState = $('input[name="RelayState"]').attr('value');
          sessionParticipantLogoutRequest = new Buffer(SAMLRequest, 'base64').toString();
          done();
        });
      });

      describe('should send Session Participant LogoutResponse to the SAML IdP', function () {
        var SAMLResponse;
      
        before(function (done) {
          // <samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
          //   ID="_2bba6ea5e677d807f06a"
          //   InResponseTo="samlr-220c705e-c15e-11e6-98a4-ecf4bbce4318"
          //   Version="2.0"
          //   IssueInstant="2016-12-16T13:37:57Z"
          //   Destination="http://localhost:5050/logout">
          //     <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">https://foobarsupport.example.com</saml:Issuer>
          //     <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
          //     </samlp:Status>
          // </samlp:LogoutResponse>
          request.post({
            jar: request.jar(),
            followRedirect: false,
            uri: 'http://localhost:5050/logout',
            json: true,
            body: {
              SAMLResponse: 'PHNhbWxwOkxvZ291dFJlc3BvbnNlIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6cHJvdG9jb2wiIElEPSJfMmJiYTZlYTVlNjc3ZDgwN2YwNmEiIEluUmVzcG9uc2VUbz0ic2FtbHItMjIwYzcwNWUtYzE1ZS0xMWU2LTk4YTQtZWNmNGJiY2U0MzE4IiBWZXJzaW9uPSIyLjAiIElzc3VlSW5zdGFudD0iMjAxNi0xMi0xNlQxMzozNzo1N1oiIERlc3RpbmF0aW9uPSJodHRwOi8vbG9jYWxob3N0OjUwNTAvbG9nb3V0Ij4KICAgIDxzYW1sOklzc3VlciB4bWxuczpzYW1sPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YXNzZXJ0aW9uIj5odHRwczovL2Zvb2JhcnN1cHBvcnQuZXhhbXBsZS5jb208L3NhbWw6SXNzdWVyPjxkczpTaWduYXR1cmUgeG1sbnM6ZHM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPjxkczpTaWduZWRJbmZvPjxkczpDYW5vbmljYWxpemF0aW9uTWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8xMC94bWwtZXhjLWMxNG4jIi8+PGRzOlNpZ25hdHVyZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMDQveG1sZHNpZy1tb3JlI3JzYS1zaGEyNTYiLz48ZHM6UmVmZXJlbmNlIFVSST0iI18yYmJhNmVhNWU2NzdkODA3ZjA2YSI+PGRzOlRyYW5zZm9ybXM+PGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNlbnZlbG9wZWQtc2lnbmF0dXJlIi8+PGRzOlRyYW5zZm9ybSBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDEvMTAveG1sLWV4Yy1jMTRuIyIvPjwvZHM6VHJhbnNmb3Jtcz48ZHM6RGlnZXN0TWV0aG9kIEFsZ29yaXRobT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjc2hhMjU2Ii8+PGRzOkRpZ2VzdFZhbHVlPkxXUmUrbGNNR0VRYTlPYjlsc0hpUk5Ob29pUDgyM2JwVFA2OFVXMUdRR0U9PC9kczpEaWdlc3RWYWx1ZT48L2RzOlJlZmVyZW5jZT48L2RzOlNpZ25lZEluZm8+PGRzOlNpZ25hdHVyZVZhbHVlPlAxeUdBaGxJZEQvZUFYWERUb0JSQ3VXekxneldxaEZpQURqMDRLcmMvSmNaNlZwVjJhVXpSWjJDR21SOUZaNVdXZlU2VVB0SG5VYU1iSVR6NjZFSEdBaCtNcC9JajNJWU1qeVltWnJtTDhJSlFZWHkzMTFwU2REQnU4REJJUm5aQkpLSG5EV0VtT0doS2NJcHhTa1hveVd3NlpCK090VWh5d3dGKzVPMXh5cnk0alJQODlxV28wN2M0MzZaMHNkbWNhZkRkU1NpeTdkMVRVMUphN0VUYnhBYnVaSFRwUDNYSzFLeTdrNUZWU3ZxcCtYc2xsVTBTWTlkMWhFd0ZlSEpnOWdCa2xxVm1iYUdGV0FhK0xZTGoxWGd2KzBnejdWa2ptVTJUV2ZZQVE2MU9vbkJ5TWpKcWFqbk5oWkorODN6L2RLbWZSd200V3FUK0hwVFVJcUhaQT09PC9kczpTaWduYXR1cmVWYWx1ZT48ZHM6S2V5SW5mbz48ZHM6WDUwOURhdGEvPjwvZHM6S2V5SW5mbz48L2RzOlNpZ25hdHVyZT4KICAgIDxzYW1scDpTdGF0dXM+PHNhbWxwOlN0YXR1c0NvZGUgVmFsdWU9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpzdGF0dXM6U3VjY2VzcyIvPgogICAgPC9zYW1scDpTdGF0dXM+Cjwvc2FtbHA6TG9nb3V0UmVzcG9uc2U+',
              RelayState: '123'
            }
          }, function (err, response) {
            if (err) { return done(err); }
            expect(response.statusCode).to.equal(200);
            $ = cheerio.load(response.body);
            SAMLResponse = $('input[name="SAMLResponse"]').attr('value');
            done();
          });
        });

        it('should respond with a Success value', function () {
          var signedAssertion = /(<samlp:StatusCode.*\/>)/.exec(new Buffer(SAMLResponse, 'base64'))[1];
          var doc = new xmldom.DOMParser().parseFromString(signedAssertion);
          var logoutResultValue = doc.documentElement.getAttribute('Value');
          expect(logoutResultValue).to.equal('urn:oasis:names:tc:SAML:2.0:status:PartialLogout');
        });
      });
    });
  });
});