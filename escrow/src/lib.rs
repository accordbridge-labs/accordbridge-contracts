#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env};

const TESTNET: [u8; 32] = [
    206, 224, 48, 45, 89, 132, 77, 50, 189, 202, 145, 92, 130, 3, 221, 68, 179, 63, 187, 126, 220,
    25, 5, 30, 163, 122, 190, 223, 40, 236, 212, 114,
];

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct State {
    pub client: Address,
    pub freelancer: Address,
    pub token: Address,
    pub amount: i128,
    pub terms: BytesN<32>,
    pub client_accepted: bool,
    pub freelancer_accepted: bool,
    pub client_refund: bool,
    pub freelancer_refund: bool,
    // 0 = awaiting funding, 1 = funded, 2 = released, 3 = refunded.
    pub status: u32,
}

#[contract]
pub struct Escrow;

fn save(env: &Env, state: &State) {
    env.storage().instance().set(&0u32, state);
    env.storage().instance().extend_ttl(100_000, 500_000);
}

#[contractimpl]
impl Escrow {
    pub fn __constructor(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        amount: i128,
        terms: BytesN<32>,
    ) {
        assert_eq!(
            env.ledger().network_id(),
            BytesN::from_array(&env, &TESTNET),
            "testnet only"
        );
        assert!(client != freelancer && amount > 0, "invalid escrow terms");
        save(
            &env,
            &State {
                client,
                freelancer,
                token,
                amount,
                terms,
                client_accepted: false,
                freelancer_accepted: false,
                client_refund: false,
                freelancer_refund: false,
                status: 0,
            },
        );
    }
    pub fn state(env: Env) -> State {
        env.storage().instance().get(&0u32).unwrap()
    }
    pub fn accept(env: Env, party: Address, terms: BytesN<32>) {
        let mut state = Self::state(env.clone());
        assert!(
            state.status == 0 && terms == state.terms,
            "stale or locked terms"
        );
        party.require_auth();
        if party == state.client {
            state.client_accepted = true;
        } else if party == state.freelancer {
            state.freelancer_accepted = true;
        } else {
            panic!("not a participant");
        }
        save(&env, &state);
    }
    pub fn fund(env: Env) {
        let mut state = Self::state(env.clone());
        state.client.require_auth();
        assert!(
            state.status == 0 && state.client_accepted && state.freelancer_accepted,
            "not ready for funding"
        );
        state.status = 1;
        save(&env, &state);
        token::Client::new(&env, &state.token).transfer(
            &state.client,
            &env.current_contract_address(),
            &state.amount,
        );
    }
    pub fn release(env: Env) {
        let mut state = Self::state(env.clone());
        state.client.require_auth();
        assert_eq!(state.status, 1, "not funded");
        state.status = 2;
        save(&env, &state);
        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &state.freelancer,
            &state.amount,
        );
    }
    pub fn request_refund(env: Env, party: Address) {
        let mut state = Self::state(env.clone());
        assert_eq!(state.status, 1, "not funded");
        party.require_auth();
        if party == state.client {
            state.client_refund = true;
        } else if party == state.freelancer {
            state.freelancer_refund = true;
        } else {
            panic!("not a participant");
        }
        if state.client_refund && state.freelancer_refund {
            state.status = 3;
        }
        save(&env, &state);
        if state.status == 3 {
            token::Client::new(&env, &state.token).transfer(
                &env.current_contract_address(),
                &state.client,
                &state.amount,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    fn setup() -> (Env, Address, Address, Address, Address, BytesN<32>) {
        let env = Env::default();
        env.ledger().with_mut(|l| l.network_id = TESTNET);
        let client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let terms = BytesN::from_array(&env, &[1; 32]);
        let escrow = env.register(
            Escrow,
            (&client, &freelancer, &token, &1500000000i128, &terms),
        );
        (env, client, freelancer, token, escrow, terms)
    }
    #[test]
    fn happy_path_and_no_double_release() {
        let (env, client, freelancer, token, address, terms) = setup();
        env.mock_all_auths();
        token::StellarAssetClient::new(&env, &token).mint(&client, &1500000000);
        let escrow = EscrowClient::new(&env, &address);
        assert!(escrow.try_fund().is_err());
        escrow.accept(&client, &terms);
        assert!(escrow.try_fund().is_err());
        escrow.accept(&freelancer, &terms);
        escrow.fund();
        assert!(escrow.try_fund().is_err());
        assert_eq!(
            token::Client::new(&env, &token).balance(&address),
            1500000000
        );
        escrow.release();
        assert_eq!(
            token::Client::new(&env, &token).balance(&freelancer),
            1500000000
        );
        assert!(escrow.try_release().is_err());
        assert!(escrow.try_request_refund(&client).is_err());
    }
    #[test]
    fn refund_requires_both_and_has_only_original_recipient() {
        let (env, client, freelancer, token, address, terms) = setup();
        env.mock_all_auths();
        token::StellarAssetClient::new(&env, &token).mint(&client, &1500000000);
        let escrow = EscrowClient::new(&env, &address);
        escrow.accept(&client, &terms);
        escrow.accept(&freelancer, &terms);
        escrow.fund();
        escrow.request_refund(&client);
        assert_eq!(escrow.state().status, 1);
        assert!(escrow.try_request_refund(&Address::generate(&env)).is_err());
        escrow.request_refund(&freelancer);
        assert_eq!(escrow.state().status, 3);
        assert_eq!(
            token::Client::new(&env, &token).balance(&client),
            1500000000
        );
        assert!(escrow.try_release().is_err());
    }
    #[test]
    fn authorization_is_required_without_mocks() {
        let (env, client, _, _, address, terms) = setup();
        let escrow = EscrowClient::new(&env, &address);
        assert!(escrow.try_accept(&client, &terms).is_err());
        assert!(escrow.try_fund().is_err());
        assert!(escrow.try_release().is_err());
    }
    #[test]
    fn wrong_terms_and_insufficient_balance_do_not_fund() {
        let (env, client, freelancer, _, address, terms) = setup();
        env.mock_all_auths();
        let escrow = EscrowClient::new(&env, &address);
        assert!(escrow
            .try_accept(&client, &BytesN::from_array(&env, &[2; 32]))
            .is_err());
        escrow.accept(&client, &terms);
        escrow.accept(&freelancer, &terms);
        assert!(escrow.try_fund().is_err());
        assert_eq!(escrow.state().status, 0);
    }
    #[test]
    fn outsider_cannot_accept_and_duplicate_refund_vote_does_not_settle() {
        let (env, client, freelancer, token, address, terms) = setup();
        env.mock_all_auths();
        let escrow = EscrowClient::new(&env, &address);
        let outsider = Address::generate(&env);
        assert!(escrow.try_accept(&outsider, &terms).is_err());
        assert!(!escrow.state().client_accepted);
        assert!(!escrow.state().freelancer_accepted);
        token::StellarAssetClient::new(&env, &token).mint(&client, &1500000000);
        escrow.accept(&client, &terms);
        escrow.accept(&freelancer, &terms);
        escrow.fund();
        let frozen = escrow.state();
        assert!(escrow.try_accept(&client, &terms).is_err());
        assert_eq!(escrow.state(), frozen);
        escrow.request_refund(&freelancer);
        escrow.request_refund(&freelancer);
        assert_eq!(escrow.state().status, 1);
        assert_eq!(
            token::Client::new(&env, &token).balance(&address),
            1500000000
        );
        // A single vote deliberately does not revoke the client's release right.
        escrow.release();
        assert_eq!(
            token::Client::new(&env, &token).balance(&freelancer),
            1500000000
        );
        assert_eq!(token::Client::new(&env, &token).balance(&address), 0);
        assert!(escrow.try_request_refund(&client).is_err());
        assert!(escrow.try_fund().is_err());
    }
    #[test]
    fn funded_escrow_rejects_missing_authorization_without_changing_balances() {
        let (env, client, freelancer, token, address, terms) = setup();
        env.mock_all_auths();
        token::StellarAssetClient::new(&env, &token).mint(&client, &1500000000);
        let escrow = EscrowClient::new(&env, &address);
        escrow.accept(&client, &terms);
        escrow.accept(&freelancer, &terms);
        escrow.fund();
        let funded = escrow.state();
        env.mock_auths(&[]);
        assert!(escrow.try_release().is_err());
        assert!(escrow.try_request_refund(&client).is_err());
        assert!(escrow.try_request_refund(&freelancer).is_err());
        assert_eq!(escrow.state(), funded);
        assert_eq!(
            token::Client::new(&env, &token).balance(&address),
            1500000000
        );
        assert_eq!(token::Client::new(&env, &token).balance(&client), 0);
        assert_eq!(token::Client::new(&env, &token).balance(&freelancer), 0);
    }
    #[test]
    fn refund_is_terminal_in_either_vote_order() {
        for client_first in [true, false] {
            let (env, client, freelancer, token, address, terms) = setup();
            env.mock_all_auths();
            token::StellarAssetClient::new(&env, &token).mint(&client, &1500000000);
            let escrow = EscrowClient::new(&env, &address);
            escrow.accept(&client, &terms);
            escrow.accept(&freelancer, &terms);
            escrow.fund();
            let (first, second) = if client_first {
                (&client, &freelancer)
            } else {
                (&freelancer, &client)
            };
            escrow.request_refund(first);
            escrow.request_refund(second);
            let refunded = escrow.state();
            assert_eq!(refunded.status, 3);
            assert!(escrow.try_request_refund(first).is_err());
            assert!(escrow.try_request_refund(second).is_err());
            assert!(escrow.try_release().is_err());
            assert!(escrow.try_fund().is_err());
            assert!(escrow.try_accept(&client, &terms).is_err());
            assert_eq!(escrow.state(), refunded);
            assert_eq!(
                token::Client::new(&env, &token).balance(&client),
                1500000000
            );
            assert_eq!(token::Client::new(&env, &token).balance(&freelancer), 0);
            assert_eq!(token::Client::new(&env, &token).balance(&address), 0);
        }
    }
    #[test]
    #[should_panic(expected = "testnet only")]
    fn refuses_other_networks() {
        let env = Env::default();
        env.register(
            Escrow,
            (
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                1i128,
                BytesN::from_array(&env, &[0; 32]),
            ),
        );
    }
}
