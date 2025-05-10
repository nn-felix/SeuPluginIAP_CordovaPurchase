// www/SeuPluginIAP_CordovaPurchase.js
var SeuPluginIAP_CordovaPurchase = {
    osCallbacks: {},

    initializeAndRegisterProducts: function(
        productsJsonString,
        validatorURL, // Novo parâmetro
        successCallbackOS,
        errorCallbackOS,
        productUpdateCallbackOS,
        purchaseApprovedCallbackOS,
        purchaseVerifiedCallbackOS, // Novo callback
        purchaseCancelledCallbackOS,
        purchaseErrorCallbackOS
    ) {
        if (!window.store && !window.CdvPurchase && !window.CdvPurchase.store) {
            console.error("IAP Plugin (window.store / CdvPurchase.store) não está disponível.");
            if (errorCallbackOS) errorCallbackOS("IAP Plugin não disponível.");
            return;
        }
        // Garantir que usamos a referência correta para o store
        var store = window.store || (window.CdvPurchase ? window.CdvPurchase.store : null);
        if (!store) {
             console.error("IAP Plugin (store object) não pôde ser referenciado.");
            if (errorCallbackOS) errorCallbackOS("IAP Plugin não referenciável.");
            return;
        }

        this.osCallbacks.onProductUpdate = productUpdateCallbackOS;
        this.osCallbacks.onPurchaseApproved = purchaseApprovedCallbackOS;
        this.osCallbacks.onPurchaseVerified = purchaseVerifiedCallbackOS; // Armazenar novo callback
        this.osCallbacks.onPurchaseCancelled = purchaseCancelledCallbackOS;
        this.osCallbacks.onPurchaseError = purchaseErrorCallbackOS;

        console.log("SeuPluginIAP_CordovaPurchase: Inicializando...");

        try {
            var productsToRegister = JSON.parse(productsJsonString);
        } catch (e) {
            console.error("SeuPluginIAP_CordovaPurchase: Erro ao fazer parse do JSON de produtos: " + e.message);
            if (errorCallbackOS) errorCallbackOS("JSON de produtos inválido: " + e.message);
            return;
        }

        if (window.CdvPurchase && window.CdvPurchase.LogLevel) {
            store.verbosity = CdvPurchase.LogLevel.DEBUG; // ou .INFO, .WARNING, .ERROR
        } else if (store) {
            store.verbosity = store.DEBUG; // Fallback para a forma antiga se existir
        }


        // Configurar o validador de recibos (MUITO RECOMENDADO)
        if (validatorURL && typeof validatorURL === 'string' && validatorURL.trim() !== "") {
            console.log("SeuPluginIAP_CordovaPurchase: Configurando validador de recibos: " + validatorURL);
            store.validator = validatorURL;
        } else {
            console.warn("SeuPluginIAP_CordovaPurchase: Validador de recibos não configurado. A validação do lado do cliente é menos segura.");
        }

        productsToRegister.forEach(function(productInfo) {
            console.log("SeuPluginIAP_CordovaPurchase: Registando produto: ID=" + productInfo.id + ", Tipo=" + productInfo.type + ", Plataforma=" + productInfo.platform);
            var productTypeConstant;
            var platformConstant = productInfo.platform; // O plugin lida com strings como 'ios', 'android'

            // O plugin v13 usa strings para tipo, mas pode ser mais robusto usar as constantes se disponíveis
            // No entanto, para um wrapper JS simples, passar a string do JSON pode ser suficiente se o plugin as aceitar.
            // As constantes são CdvPurchase.ProductType.CONSUMABLE, .NON_CONSUMABLE, .PAID_SUBSCRIPTION, etc.
            // Vamos manter como estava no guia original, pois o wrapper converte para as constantes do 'store'.
            switch (productInfo.type.toLowerCase()) {
                case "non consumable": case "non_consumable":
                    productTypeConstant = store.NON_CONSUMABLE;
                    break;
                case "consumable":
                    productTypeConstant = store.CONSUMABLE;
                    break;
                case "subscription": case "paid subscription": case "paid_subscription":
                    productTypeConstant = store.PAID_SUBSCRIPTION; // Ou store.APPLICATION, store.FREE_SUBSCRIPTION dependendo do tipo exato
                    break;
                default:
                    console.warn("SeuPluginIAP_CordovaPurchase: Tipo de produto desconhecido '" + productInfo.type + "'. Usando NON_CONSUMABLE.");
                    productTypeConstant = store.NON_CONSUMABLE;
            }

            store.register({
                id: productInfo.id,
                alias: productInfo.alias || productInfo.id,
                type: productTypeConstant,
                platform: platformConstant // O plugin cordova-plugin-purchase espera isto.
            });
        });

        // Handlers de Eventos Globais
        store.when('product').updated(function (product) {
            console.log("SeuPluginIAP_CordovaPurchase: Evento 'updated' para produto: ID=" + product.id + ", Estado=" + product.state);
            if (SeuPluginIAP_CordovaPurchase.osCallbacks.onProductUpdate) {
                SeuPluginIAP_CordovaPurchase.osCallbacks.onProductUpdate(JSON.stringify(product));
            }
        });

        store.when('product').approved(function (transaction) { // O evento approved agora retorna uma transação
            console.log("SeuPluginIAP_CordovaPurchase: Evento 'approved' para transação: ID=" + transaction.products[0].id);
            // Ações imediatas após aprovação (ex: atualizar UI para "processando")
            // A lógica de verificar e finalizar deve estar no 'verified' se usar validador.
            if (SeuPluginIAP_CordovaPurchase.osCallbacks.onPurchaseApproved) {
                SeuPluginIAP_CordovaPurchase.osCallbacks.onPurchaseApproved(JSON.stringify(transaction)); // Envia a transação inteira
            }
            // Se houver um validador configurado, chame transaction.verify()
            if (store.validator) {
                console.log("SeuPluginIAP_CordovaPurchase: Solicitando verificação para transação aprovada...");
                transaction.verify();
            } else {
                // Sem validador, considere 'approved' como o ponto para finalizar, MAS ISTO É MENOS SEGURO.
                // É melhor expor uma ação FinishTransaction para ser chamada do OutSystems.
                console.warn("SeuPluginIAP_CordovaPurchase: Transação aprovada, mas sem validador. Chame FinishTransaction manualmente após conceder o item.");
            }
        });

        store.when('receipt').verified(function (receipt) { // O evento é 'receipt' e o método 'verified'
            console.log("SeuPluginIAP_CordovaPurchase: Evento 'verified' para recibo: " + receipt.id);
            // Este é o ponto ideal para conceder o item/funcionalidade ao utilizador.
            // E DEPOIS finalizar a transação.
            if (SeuPluginIAP_CordovaPurchase.osCallbacks.onPurchaseVerified) {
                SeuPluginIAP_CordovaPurchase.osCallbacks.onPurchaseVerified(JSON.stringify(receipt));
            }
            // IMPORTANTE: Agora, exponha uma ação para finalizar a transação a partir do OutSystems
            // após o cliente OutSystems confirmar que o item foi provisionado com base neste evento.
            // Ex: receipt.finish(); não deve ser chamado automaticamente aqui sem a lógica da app confirmar.
            console.log("SeuPluginIAP_CordovaPurchase: Recibo verificado. Chame a ação FinishTransaction do OutSystems com este recibo.");
        });


        store.when('product').owned(function(product) {
            console.log("SeuPluginIAP_CordovaPurchase: Evento 'owned' para produto: ID=" + product.id);
            if (SeuPluginIAP_CordovaPurchase.osCallbacks.onProductUpdate) { // Pode ser tratado como atualização
                SeuPluginIAP_CordovaPurchase.osCallbacks.onProductUpdate(JSON.stringify(product));
            }
        });

        store.when('product').cancelled(function (product) {
            console.log("SeuPluginIAP_CordovaPurchase: Evento 'cancelled' para produto: ID=" + product.id);
            if (SeuPluginIAP_CordovaPurchase.osCallbacks.onPurchaseCancelled) {
                SeuPluginIAP_CordovaPurchase.osCallbacks.onPurchaseCancelled(JSON.stringify(product));
            }
        });

        store.error(function(error) {
            console.error('SeuPluginIAP_CordovaPurchase: ERRO GLOBAL DO STORE: ' + error.code + ': ' + error.message);
            if (SeuPluginIAP_CordovaPurchase.osCallbacks.onPurchaseError) {
                SeuPluginIAP_CordovaPurchase.osCallbacks.onPurchaseError("Erro Global Store: " + error.message + " (Code: " + error.code + ")");
            }
        });
        
        // Inicializar a loja (algumas plataformas podem necessitar de opções)
        // Exemplo do README: store.initialize([{ platform: CdvPurchase.Platform.APPLE_APPSTORE, options: { needAppReceipt: true } }])
        // Para um wrapper genérico, uma inicialização simples ou permitir passar opções.
        // Vamos assumir inicialização padrão por agora. O plugin geralmente se auto-inicializa.
        // store.initialize(); // Verifique a documentação se a inicialização explícita é sempre necessária.

        store.ready(function() {
            console.log("SeuPluginIAP_CordovaPurchase: Store está pronto.");
            // O refresh é frequentemente chamado após o ready para carregar produtos.
            console.log("SeuPluginIAP_CordovaPurchase: Chamando store.refresh()...");
            store.refresh(); // Chamar refresh aqui garante que os produtos são carregados.
            if (successCallbackOS) successCallbackOS("Store pronto e produtos registados/atualizados.");
        });
        // Se o store.ready não chamar refresh implicitamente ou se o refresh inicial falhar,
        // pode ser necessário chamar store.refresh() explicitamente após o ready.
        // A implementação acima chama refresh dentro do ready.
    },

    purchaseProduct: function(productId, orderInitiatedCallbackOS, orderErrorCallbackOS) {
        var store = window.store || (window.CdvPurchase ? window.CdvPurchase.store : null);
        if (!store) {
            console.error("SeuPluginIAP_CordovaPurchase: Store não disponível para compra.");
            if (orderErrorCallbackOS) orderErrorCallbackOS("IAP Plugin não disponível");
            return;
        }
        console.log("SeuPluginIAP_CordovaPurchase: Tentando comprar produto: " + productId);
        var productToOrder = store.get(productId);

        if (!productToOrder || !productToOrder.canPurchase) { // 'canPurchase' é mais apropriado que 'valid'
            var errorMsg = "SeuPluginIAP_CordovaPurchase: Produto '" + productId + "' não encontrado, inválido ou não pronto para compra.";
            console.error(errorMsg);
            if (orderErrorCallbackOS) orderErrorCallbackOS(errorMsg);
            return;
        }

        // O método 'order' pode ser chamado num 'offer' do produto.
        // Exemplo do README: product.getOffer()?.order().then(...)
        // Simplificando para store.order(product) ou store.order(productId) que ainda é comum.
        var orderPromise = store.order(productToOrder); // Passar o objeto produto pode ser mais robusto

        if (orderPromise && typeof orderPromise.then === 'function') {
            orderPromise.then(function() {
                console.log("SeuPluginIAP_CordovaPurchase: Pedido de compra para '" + productId + "' submetido.");
                if (orderInitiatedCallbackOS) orderInitiatedCallbackOS("Pedido de compra submetido.");
            }).catch(function(error) {
                console.error("SeuPluginIAP_CordovaPurchase: Erro ao submeter pedido para '" + productId + "': ", (error.message || error));
                if (orderErrorCallbackOS) orderErrorCallbackOS("Erro ao submeter pedido: " + (error.message || error));
            });
        } else {
             // Se não retorna promessa, os eventos globais tratarão.
            console.log("SeuPluginIAP_CordovaPurchase: store.order() chamado para '" + productId + "'. Aguardando eventos globais.");
            if (orderInitiatedCallbackOS) orderInitiatedCallbackOS("Pedido de compra submetido, aguardando eventos.");
        }
    },

    restorePurchases: function(restoreStartedCallbackOS, restoreErrorCallbackOS) {
        var store = window.store || (window.CdvPurchase ? window.CdvPurchase.store : null);
        if (!store) {
            console.error("SeuPluginIAP_CordovaPurchase: Store não disponível para restaurar.");
            if (restoreErrorCallbackOS) restoreErrorCallbackOS("IAP Plugin não disponível");
            return;
        }
        console.log("SeuPluginIAP_CordovaPurchase: Tentando restaurar compras...");
        try {
            store.restore(); // Dispara eventos 'approved', 'verified', 'owned' para items restaurados
            if (restoreStartedCallbackOS) restoreStartedCallbackOS("Processo de restauro iniciado.");
        } catch (err) {
            console.error("SeuPluginIAP_CordovaPurchase: Erro ao chamar store.restore(): ", err);
            if (restoreErrorCallbackOS) restoreErrorCallbackOS("Erro ao iniciar restauro: " + err.message);
        }
    },

    getProductDetails: function(productId, successCallbackOS, errorCallbackOS) {
        var store = window.store || (window.CdvPurchase ? window.CdvPurchase.store : null);
        if (!store || !store.get) {
            console.error("SeuPluginIAP_CordovaPurchase: Store ou store.get não disponível.");
            if (errorCallbackOS) errorCallbackOS("IAP Plugin ou função get não disponível.");
            return;
        }
        var product = store.get(productId);
        if (product && product.valid) { // 'valid' ainda é um bom indicador aqui
            console.log("SeuPluginIAP_CordovaPurchase: Detalhes do produto '" + productId + "' obtidos.");
            if (successCallbackOS) successCallbackOS(JSON.stringify(product));
        } else {
            var errorMsg = "SeuPluginIAP_CordovaPurchase: Produto '" + productId + "' não encontrado ou inválido.";
            console.error(errorMsg);
            if (errorCallbackOS) errorCallbackOS(errorMsg);
        }
    },

    // Nova ação para finalizar transações explicitamente a partir do OutSystems
    finishTransaction: function(productOrReceiptJsonFromEvent, successCallbackOS, errorCallbackOS) {
        var store = window.store || (window.CdvPurchase ? window.CdvPurchase.store : null);
        if (!store) {
            console.error("SeuPluginIAP_CordovaPurchase: Store não disponível para finalizar.");
            if (errorCallbackOS) errorCallbackOS("IAP Plugin não disponível para finalizar.");
            return;
        }
        try {
            var objectToFinish = JSON.parse(productOrReceiptJsonFromEvent);
            // O objeto 'transaction' ou 'receipt' tem um método finish().
            // Precisamos encontrar o objeto correto na 'store' ou usar o que foi passado.
            // O mais seguro é usar o objeto da transação ou recibo que foi passado no evento.
            // O plugin cordova-plugin-purchase espera que você chame finish() no objeto original.
            // Esta é uma simplificação; na prática, você pode precisar re-obter o produto/transação.
            // Mas o ideal é que o objeto passado no evento 'approved' ou 'verified' tenha o método finish().

            // Tentativa de criar um objeto que possa ter o método finish.
            // Isto é complexo porque o objeto original com o método .finish() precisa ser usado.
            // A melhor abordagem é:
            // 1. No evento 'approved'/'verified', o OutSystems recebe o JSON do 'transaction'/'receipt'.
            // 2. O OutSystems decide se provisiona o item.
            // 3. Se sim, o OutSystems chama esta ação `finishTransaction` passando o MESMO JSON.
            // 4. Aqui, tentamos encontrar a transação/produto na 'store' usando o ID do JSON e chamar finish() nela.

            var idToFinish;
            var isTransaction = objectToFinish.transaction && objectToFinish.products && objectToFinish.products.length > 0;
            var isReceipt = objectToFinish.purchaseTime && objectToFinish.id; // Um recibo tem 'id' (token)

            if (isTransaction) {
                idToFinish = objectToFinish.products[0].id; // ID do produto na transação
                var transactionObject = store.when().approved(function(t){ if(t.id === objectToFinish.id) return t; }); // Isto é conceitual
                // A forma correta, conforme a doc, é que `transaction.finish()` seja chamado no objeto transação recebido no `approved`.
                // Se o `objectToFinish` é o próprio objeto transação, ele deveria ter o método.
                // A serialização JSON perde os métodos.

                // Solução: Na app OutSystems, guarde o ID da transação (transaction.id) do evento 'approved'.
                // E passe esse ID para 'finishTransaction'.
                // O plugin não expõe uma forma de finalizar por ID arbitrário facilmente.
                // A forma mais simples é chamar product.finish() no produto que foi verificado.

                // Vamos assumir que `ProductJsonFromEvent` é o JSON do `product` que está dentro da `transaction` ou `receipt`.
                // E que este `product` foi o que acionou o `approved` ou `verified`.
                var productObj = store.get(objectToFinish.id || (objectToFinish.products && objectToFinish.products[0].id));
                if (productObj && productObj.finish) {
                     productObj.finish();
                     console.log("SeuPluginIAP_CordovaPurchase: finish() chamado no produto: " + productObj.id);
                     if (successCallbackOS) successCallbackOS("Transação finalizada para " + productObj.id);
                } else {
                    throw new Error("Não foi possível encontrar o produto ou o método finish no objeto fornecido.");
                }

            } else if (isReceipt) { // Se for um objeto receipt do evento 'verified'
                // O 'receipt' em si tem o método finish()
                // O objeto `receipt` recebido no `store.when('receipt').verified(receipt => { receipt.finish(); });`
                // Novamente, a serialização JSON perde o método.
                // A melhor forma é que o evento verified em OutSystems dispare uma chamada para finalizar *aquela* transação/recibo específica.
                // Esta ação wrapper simplificada assume que o ID do produto é suficiente.
                 var productFromReceipt = store.get(objectToFinish.transactions && objectToFinish.transactions[0] ? objectToFinish.transactions[0].products[0].id : null);
                 if (productFromReceipt && productFromReceipt.finish) {
                    productFromReceipt.finish();
                    console.log("SeuPluginIAP_CordovaPurchase: finish() chamado no produto associado ao recibo: " + productFromReceipt.id);
                    if (successCallbackOS) successCallbackOS("Transação (via recibo) finalizada para " + productFromReceipt.id);
                 } else {
                    throw new Error("Não foi possível finalizar via recibo. Objeto produto não encontrado ou sem método finish.");
                 }
            } else {
                 throw new Error("Objeto inválido para finalizar. Esperado JSON de transação ou recibo com produto.");
            }

        } catch (err) {
            console.error("SeuPluginIAP_CordovaPurchase: Erro ao finalizar transação: ", err);
            if (errorCallbackOS) errorCallbackOS("Erro ao finalizar: " + err.message);
        }
    }
};
module.exports = SeuPluginIAP_CordovaPurchase;