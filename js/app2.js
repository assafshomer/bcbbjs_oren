﻿var CMODE = "view";
var fileUploaded = false;
var useFavIcon = false;
var fileWidth = 0, fileHeight = 0;
var fileUrl = "";
var posX, posY; // SELECTED POSITION
var calcPrice, newPrice, totalPrice, totalBuyPrice;
var lrX, lrY;
var cursorReset = true;

// bitcoin client
var WAIT_FOR_PRICE;
var old_addresses;
var new_addresses;
var fees;
var rawTxHex, rawTxHex2;
var totalGenerated;
var staging_address;
var substaging_addresses;
var substageCount;
var subTxHex, subTxHash;
var cSubstage = 0;

function getPixelUrl(x, y) {
    if (x == lrX && y == lrY) {
        $.ajax({
            type: "GET", url: SERVER_GETPIXEL_URL,
            async: false,
            data: {
                X: x, Y: y
            },
            success: function (response) {
                if (response == "") { // EMPTY PIXEL
                    resetCursor();
                } else { // GOT URL
                    $("#cboard").css("cursor", "pointer");
                    $("#cboard").click(function () { if (x == lrX && y == lrY && CMODE == "view") window.open(response); });
                    cursorReset = false;
                }
            }
        });
    }
}

function positionSelected() {
    CMODE = "view";
    updateFileDetails();
    $("#myimage, #cboard").css("cursor", "default");
    $(".overlay").show();
    $(".dialog.customize").show();
}

function readURL(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();

        reader.onload = function (e) {
            $("#myimage").attr("src", e.target.result);
            $(".preview img").attr("src", e.target.result);
            $(".preview").css("display", "block");
            fileUploaded = true; updateFileDetails();
        }

        reader.readAsDataURL(input.files[0]);
    }
}


function setCustomizeDialog() {
    $("#uploadimage").change(function () {
        readURL(this);
    });

    $(".dialog.customize .selectposition").on("click", function (e) {
        e.preventDefault();
        CMODE = "buy";
        selectPosition();
    });

    $(".dialog.customize button.checkout").on("click", function (e) {
        e.preventDefault();
        if (!validateLink()) return;
        if (!fileUploaded && !useFavIcon) { alert("No file selected."); return; }
        if (posX == null || posY == null) { alert("No position selected."); return; }

        $("#checkoutprice").html("(Calculating...)");
        $("#checkoutnewprice").val(newPricePerPixel / BTC_DISPLAY_UNIT);
        $(".dialog.checkout .totalprice").html("(Calculating...)");
        $(".dialog.customize").hide();
        $(".dialog.checkout").show();

        $("#payqr, #payaddr").hide();
        $("#checkoutnewprice").removeAttr("disabled");
        $(".prvkeys").hide();

        appendLog("Fetching current pixel data from server...");
        fees = calculate_tx_fees(fileWidth * fileHeight);

        var req = $.ajax({
            type: "GET", url: SERVER_GETPRICE_URL + "/?tlx=" + posX + "&tly=" + posY + "&brx=" + (posX + fileWidth - 1) + "&bry=" + (posY + fileHeight - 1),
            crossDomain: true,
            xhrFields: {
                withCredentials: false
            },
            timeout: REQUEST_TIMEOUT,
            success: function (response) {
                old_addresses = response;
                totalBuyPrice = 0;
                for (var i = 0; i < fileWidth*fileHeight; i++) {
                    var buyPrice = parseFloat(old_addresses["data"][i]["b"]);
                    if (buyPrice == 0 || old_addresses["data"][i]["g"] == true) buyPrice = GEN_PIXEL_PRICE;
                    buyPrice = buyPrice - (buyPrice % TRUN_MOD);
                    totalBuyPrice += buyPrice;
                }
                $("#checkoutprice").html((totalBuyPrice / BTC_DISPLAY_UNIT) + " mBTC");
                gotServerData();
            },
            error: function (ajaxContext) {
                alert(ajaxContext.statusText);
                return;
            }
        });

    });
}

function calculateTotalPrice() {
    var res = WAIT_FOR_PRICE / BTC_DISPLAY_UNIT;
    $(".dialog.checkout .totalprice").html(isNaN(res) ? "(Calculating...)" : res + " mBTC");
}

function updateFileDetails() { // UPDATE DIALOG WITH PREVIEW, DIMENSIONS & POSITION
    if (useFavIcon || fileUploaded) {
        fileWidth = $("#myimage").width();
        fileHeight = $("#myimage").height();
        substageCount = Math.ceil(fileWidth * fileHeight / MAX_PIXELS_PER_TRAN);
        new_addresses = new Array(fileWidth*fileHeight);
        totalGenerated = 0;
        $(".dialog.customize .sizestatus").html("Width: " + fileWidth + "px Height: " + fileHeight + "px");
        $(".dialog.customize .preview").show();
        $(".dialog.customize .positionstatus").show();
        if (posX == null || posY == null) {
            $(".dialog.customize .cpos").html("No position selected.");
        } else { $(".dialog.customize .cpos").html("X: " + posX + " Y: " + posY); }
    } else {
        $(".dialog.customize .sizestatus").html("No image selected.");
        $(".dialog.customize .preview").hide();
        $(".dialog.customize .positionstatus").hide();
        $(".dialog.customize .cpos").html("No position selected.");
    }
}

function extractFavIcon() { // INSERT A SERVER CALL HERE AFTER VALIDATING THE URL CLIENT-WISE
    if (!validateLink()) return false;
    var url = $(".dialog.customize .linkurl").val();
    if (url.substring(0, 4) != "http") {
        alert("Failed to extract favicon"); return false;
    }
    return true;
}

function validateLink() { // VALIDATE LINK
    var url = $(".dialog.customize .linkurl").val();
    if (url == "") { $(".dialog.customize .linkurl").focus(); return false; }
    return true;
}

$(document).ready(function () {
    initBoard();
    loadBoardImage();
    initGUI();
    $("#serverroot").val(SERVER_ROOT);
    $("#serverroot").change(function () {
        SERVER_ROOT = $(this).val();
        SERVER_GETPRICE_URL = SERVER_ROOT + "/api/pixels";
    });
});

function loadBoardImage() {
    $("#cboard").attr("src", SERVER_BOARDIMAGE_URL);
}

function initBoard() {
    $(".header, .board, .holder").css("max-width", BOARD_WIDTH);
    resizeBoard();
    $(window).on("resize", function () { resizeBoard(); });
    $("#cboard, #myimage").on("dragstart", function (event) {
        event.preventDefault();
    });

    $("#cboard, #myimage").hammer({ drag_lock_to_axis: true })
    .on("release dragleft dragright swipeleft swiperight dragup dragdown swipeup swipedown", handleSwipes);

    initBoardUsability();
}

function initBoardUsability() {
    $("#cboard, #myimage").on("dblclick", function (e) {
        if (CMODE == "buy") {
            posX = lrX + 1; posY = lrY + 1;
            positionSelected();
        }
    });
    $("#cboard, #myimage").on("mousemove", function (e) {
        var parentOffset = $("#cboard").offset();
        var relX = e.pageX - parentOffset.left;
        var relY = e.pageY - parentOffset.top;

        switch (CMODE) {
            case "view":
                resetCursor();
                lrX = relX; lrY = relY;
                setTimeout("getPixelUrl(" + lrX + "," + lrY + ");", MOUSE_STALE_TIME);
                break;
            case "buy":
                resetCursor();
                relX = relX - (relX % GRID_SIZE);
                relY = relY - (relY % GRID_SIZE);
                if (relX + fileWidth > BOARD_WIDTH || relY + fileHeight > BOARD_HEIGHT) return;
                lrX = relX; lrY = relY;
                var parentOffset2 = $(".board").offset();
                var disX = e.pageX - parentOffset2.left;
                var disY = e.pageY - parentOffset2.top;
                disX = disX - (disX % GRID_SIZE);
                disY = disY - (disY % GRID_SIZE);
                $("#myimage").css("left", disX);
                $("#myimage").css("top", disY);
                break;
        }
    });
}

function resetCursor() {
    if (cursorReset) return;
    $("#cboard").css("cursor", "default");
    $("#cboard").click(function () { });
    cursorReset = true;
}

function resizeBoard() {
    var nHeight = $(window).height() - $(".holder").outerHeight() - $(".header").outerHeight();
    $(".board").css("height", nHeight > BOARD_HEIGHT ? BOARD_HEIGHT : nHeight);
    $("#cboard").css("top", 0); $("#cboard").css("left", 0);
}

function handleSwipes(ev) {
    ev.gesture.preventDefault();
    var direction;
    switch (ev.type) {
        case 'dragright': direction = "right"; break;
        case 'dragleft': direction = "left"; break;
        case 'dragup': direction = "up"; break;
        case 'dragdown': direction = "down"; break;
        case 'swipeleft': direction = "left"; break;
        case 'swiperight': direction = "right"; break;
        case 'swipeup': direction = "up"; break;
        case 'swipedown': direction = "down"; break;
        case 'release':
            break;
    }

    switch (direction) {
        case "left":
            var cLeft = $("#cboard").offset().left;
            var cWidth = $("#cboard").width();
            var cWindow = $(".board").width();
            var tLeft = cLeft - cWindow;
            if (tLeft + cWidth < cWindow) tLeft = cWindow - cWidth;
            $("#cboard").animate({ left: tLeft + "px" }, 500, function () { });
            ev.gesture.stopDetect();
            break;
        case "right":
            var cLeft = $("#cboard").offset().left;
            var cWidth = $("#cboard").width();
            var cWindow = $(".board").width();
            var tLeft = cLeft + cWindow;
            if (tLeft > 0) tLeft = 0;
            $("#cboard").animate({ left: tLeft + "px" }, 500, function () { });
            ev.gesture.stopDetect();
            break;
        case "up":
            var cTop = $("#cboard").offset().top;
            var cHeight = $("#cboard").height();
            var cWindow = $(".board").height();
            var tTop = cTop - cWindow;
            if (tTop + cHeight < cWindow) tTop = cWindow - cHeight;
            $("#cboard").animate({ top: tTop + "px" }, 500, function () { });
            ev.gesture.stopDetect();
            break;
        case "down":
            var cTop = $("#cboard").offset().top;
            var cHeight = $("#cboard").height();
            var cWindow = $(".board").height();
            var tTop = cTop + cWindow;
            if (tTop > 0) tTop = 0;
            $("#cboard").animate({ top: tTop + "px" }, 500, function () { });
            ev.gesture.stopDetect();
            break;
    }
}

function initGUI() {
    $(".dialog .title .close").on("click", function () {
        $(".overlay").hide();
        $(".dialog.customize").hide();
        $(".dialog.checkout").hide();
    });

    setCustomizeDialog();
    setCheckoutDialog();

    $(".buynow").click(function (e) {
        e.preventDefault();
        startWizard();
    });
}

function setCheckoutDialog() {
    $("#checkoutnewprice").on("keyup", function () {
        var n = $(this).val();
        newPricePerPixel = parseFloat(n) * BTC_DISPLAY_UNIT;
        if (isNaN(newPricePerPixel)) newPricePerPixel = 0;
        updateWaitForPrice();
        calculateTotalPrice();
    });
    $(".dialog.checkout .back").on("click", function () {
        $(".dialog.checkout").hide();
        $(".dialog.customize").show();
    });
}

function startWizard() {
    $(".overlay").show();
    $(".dialog.customize").show();
    $(".dialog.customize .linkurl").focus();
}

function selectPosition() {
    $(".overlay").hide();
    $(".dialog.customize").hide();
    $("#myimage, #cboard").css("cursor", "crosshair");
    alert("Double-click to select position.");
}

function totalPixels(substage) {
    var total = fileWidth * fileHeight;
    if (substageCount == 1) return total;
    if (substage == substageCount - 1) {
        return total % MAX_PIXELS_PER_TRAN;
    } else {
        return MAX_PIXELS_PER_TRAN;
    }
}

function gotServerData() {
    //debugger;
    appendLog("Generating new addresses (<span id='totalGenerated'>0</span>/" + (fileWidth*fileHeight) + ")...");

    if (!staging_address) {
        staging_address = generateBitcoinAddress(true);
        substaging_addresses = new Array(substageCount);
        for (var s = 0; s < substageCount; s++) {
            substaging_addresses[s] = generateBitcoinAddress(true);
        }
    }

    $("#staging").html(JSON.stringify(staging_address));

    window.requestAnimationFrame(generateAddress);
}

function generateAddress() {
    new_addresses[totalGenerated] = generateBitcoinAddress(false);
    totalGenerated++; $("#totalGenerated").html(totalGenerated);

    if (totalGenerated < fileWidth*fileHeight) {
        window.requestAnimationFrame(generateAddress);
    } else {
        // finished
        var csv = "";
        for (var n = 0; n < new_addresses.length; n++) {
            csv += new_addresses[n]["privatekey"] + "\n";
        }
        var csvBlob = new Blob([csv], { type: 'text/csv' });
        $(".dlprvkeys").attr("href", window.URL.createObjectURL(csvBlob));
        $(".dlprvkeys").attr("download", "blockchain_billboard_" + ((Math.random() * 100000).toFixed(0)) + ".csv");

        appendLog("Reading pixels from image (grayscale)...");
        setTimeout("generateAddresses_completed();", 0);
    }
}

function generateAddresses_completed() {
    readImagePixels();
    generateUnformattedTransactions();
    $(".prvkeys").show();
}

function generateUnformattedTransactions() {
    var staging_to_new = "", new_to_old = "";
    totalPrice = 0;
    fees = calculate_tx_fees(fileWidth*fileHeight);

    for (var i = 0; i < fileWidth*fileHeight ; i++) {
        var buyPrice = parseFloat(old_addresses["data"][i]["b"]);
        if (buyPrice == 0 || old_addresses["data"][i]["g"] == true) buyPrice = GEN_PIXEL_PRICE;
        buyPrice = buyPrice - (buyPrice % TRUN_MOD);
        var colorData = parseFloat(new_addresses[i]["color"]);
        var pixelPrice = buyPrice + colorData;

        totalPrice += pixelPrice;
    }

    debugger;
    totalPrice += fees.funding + fees.transfer + fees.prestage;
    updateWaitForPrice();
    calculateTotalPrice();

    appendLog("<span onclick='waitForPrice();' class='makeDeposit'>Make Payment >></span>");
}

function updateWaitForPrice() {
    WAIT_FOR_PRICE = totalPrice + (newPricePerPixel * fileWidth*fileHeight);

    var qrAmount = parseFloat(WAIT_FOR_PRICE / 100000000).toFixed(8);
    var qr = "<iframe src='https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=bitcoin:" + staging_address.address + "?amount=" + qrAmount + "' style='width:150px;height:150px;border-style:none;' scrolling='no' />";
    $("#payqr").html(qr);
    $("#payaddr").html(staging_address.address);
}

var totalStagingBalanceAttempts = 0;
function waitForPrice() {
    $(".dialog.checkout .back, .dialog.checkout .close").hide();
    $("#payqr, #payaddr").show();
    $("#checkoutnewprice").attr("disabled", "disabled");

    appendLog("Checking staging address balance...");
    var checkBalanceUrl = "https://testnet3.toshi.io/api/v0/addresses/" + staging_address.address;
    var req = $.ajax({
        type: "GET", url: checkBalanceUrl,
        crossDomain: true,
        xhrFields: {
            withCredentials: false
        },
        timeout: REQUEST_TIMEOUT,
        success: function (response) {
            //debugger;
            var rBalance = response.balance;
            var usingUnconfirmed = false;

            if (response.unconfirmed_balance > rBalance) {
                rBalance = response.unconfirmed_balance;
                usingUnconfirmed = true;
            }

            if (rBalance >= WAIT_FOR_PRICE) {
                if (usingUnconfirmed) { appendLog("Using unconfirmed balance."); }
                totalStagingBalanceAttempts += 1;
                appendLog("Sufficient balance found!");
                generateTransactions();
                return;
            } else {
                totalStagingBalanceAttempts += 1;
                setTimeout("waitForPrice();", BALANCE_QUERY_INTERVAL);
            }
        },
        error: function (ajaxContext) {
            totalStagingBalanceAttempts += 1;
            setTimeout("waitForPrice();", BALANCE_QUERY_INTERVAL);
        }
    });
}

function generateTransactions() {
    appendLog("Checking confirmed transactions...");
    var getUnspentUrl = "https://testnet3.toshi.io/api/v0/addresses/" + staging_address.address + "/unspent_outputs";
    var req = $.ajax({
        type: "GET", url: getUnspentUrl,
        crossDomain: true,
        xhrFields: {
            withCredentials: false
        },
        timeout: REQUEST_TIMEOUT,
        success: function (response) {
            // staging to new
            prestageTx = new bitcoin.Transaction();

            var totalUnspentsValue = 0;
            for (var idx = 0; idx < response.length; idx++) {
                var unspent = response[idx];
                if (unspent.addresses.length > 0 && !unspent.spent) {
                    prestageTx.addInput(unspent.transaction_hash, unspent.output_index);
                    totalUnspentsValue += unspent.amount;
                }
            }
            completeTransactions(prestageTx, totalUnspentsValue);
        },
        error: function (ajaxContext) {
            appendLog("Checking unconfirmed transactions...");
            tryUnconfirmed();
        }
    });
}

var prestageTx;
function completeTransactions(tx, totalUnspentsValue) {
    appendLog("Generating transactions ("+(cSubstage+1)+"/"+substageCount+")...");

    if (cSubstage == 0) {
        for (s = 0; s < substageCount; s++) {
            var totalSubstage = 0;
            var offset = s * MAX_PIXELS_PER_TRAN;
            for (var i = offset; i < offset + totalPixels(s) ; i++) {
                var buyPrice = parseFloat(old_addresses["data"][i]["b"]);
                if (buyPrice == 0 || old_addresses["data"][i]["g"] == true) buyPrice = GEN_PIXEL_PRICE;
                buyPrice = buyPrice - (buyPrice % TRUN_MOD);
                var colorData = parseFloat(new_addresses[i]["color"]);
                var pixelPrice = buyPrice + colorData;

                totalSubstage += pixelPrice;
            }
            debugger;
            var fees = calculate_tx_fees(totalPixels(s));
            totalSubstage += fees.funding + fees.transfer;
            tx.addOutput(substaging_addresses[s]["address"], totalSubstage);
            substaging_addresses[s]["total"] = totalSubstage;
            totalUnspentsValue -= totalSubstage;
        }
        var ecKey = new bitcoin.ECKey(staging_address.privatekey);
        for (var idx = 0; idx < tx.ins.length; idx++) tx.sign(idx, ecKey);

        var subTx = tx.serialize();
        subTxHex = tx.serializeHex();
        var subHashBytes = Crypto.SHA256(Crypto.SHA256(subTxHex, { asBytes: true }), { asBytes: true });
        subHash = bytesToHex(subHashBytes.reverse());
    }
    
    var fees = calculate_tx_fees(totalPixels(cSubstage));
    //new tx
    var tx1 = new bitcoin.Transaction();
    tx1.addInput(subHash, cSubstage);
    var offset = cSubstage * MAX_PIXELS_PER_TRAN;

    for (var i = offset; i < offset + totalPixels(cSubstage) ; i++) {
        var buyPrice = parseFloat(old_addresses["data"][i]["b"]);
        if (buyPrice == 0 || old_addresses["data"][i]["g"] == true) buyPrice = GEN_PIXEL_PRICE;
        buyPrice = buyPrice - (buyPrice % TRUN_MOD);
        var colorData = parseFloat(new_addresses[i]["color"]);
        var pixelPrice = buyPrice + newPricePerPixel + colorData;

        tx1.addOutput(new_addresses[i]["address"], pixelPrice);
        substaging_addresses[cSubstage]["total"] -= pixelPrice;
    }

    debugger;
    substaging_addresses[cSubstage]["total"] -= fees.funding;
    tx1.addOutput(substaging_addresses[cSubstage]["address"], substaging_addresses[cSubstage]["total"]);

    var ecKey = new bitcoin.ECKey(substaging_addresses[cSubstage].privatekey);
    for (var idx = 0; idx < tx1.ins.length; idx++) tx1.sign(idx, ecKey);

    var rawTx = tx1.serialize();
    substaging_addresses[cSubstage]["hex1"] = tx1.serializeHex();

    var funHashBytes = Crypto.SHA256(Crypto.SHA256(rawTx, { asBytes: true }), { asBytes: true });
    var funHash = bytesToHex(funHashBytes.reverse());

    // transfer!
    var tx2 = new bitcoin.Transaction();

    var offset = cSubstage * MAX_PIXELS_PER_TRAN;
    for (var idx = offset; idx < offset + totalPixels(cSubstage) ; idx++) {
        tx2.addInput(funHash, idx);
        var buyPrice = parseFloat(old_addresses["data"][idx]["b"]);
        if (buyPrice == 0 || old_addresses["data"][idx]["g"] == true) buyPrice = GEN_PIXEL_PRICE;
        buyPrice = buyPrice - (buyPrice % TRUN_MOD);
        tx2.addOutput(old_addresses["data"][idx]["a"], buyPrice);
        var changeBack = tx2.outs[idx-offset].value - buyPrice;
        tx2.addOutput(new_addresses[idx]["address"], changeBack);
    }
    tx2.addInput(funHash, totalPixels(cSubstage));
    // rest of fees from staging address
    //tx2.addOutput(staging_address["address"], totalUnspentsValue - fees.transfer);
    for (var idx = 0; idx < totalPixels(cSubstage) ; idx++) {
        var ecKey2 = new bitcoin.ECKey(new_addresses[idx]["privatekey"]);
        tx2.sign(idx, ecKey2);
    }
    tx2.sign(totalPixels(cSubstage), ecKey);

    substaging_addresses[cSubstage]["hex2"] = tx2.serializeHex();

    appendLog("Broadcasting transactions (" + (cSubstage + 1) + "/" + substageCount + ")...");
    if (cSubstage == 0) {
        window.requestAnimationFrame(function () { relaySUB(cSubstage); });
    } else {
        window.requestAnimationFrame(function () { relaySTN(cSubstage); });
    }
}

function tryUnconfirmed() {
    var unconfirmedUrl = "https://testnet3.toshi.io/api/v0/addresses/" + staging_address.address + "/transactions";
    var req = $.ajax({
        type: "GET", url: unconfirmedUrl,
        crossDomain: true,
        xhrFields: {
            withCredentials: false
        },
        timeout: REQUEST_TIMEOUT,
        success: function (response) {
            // staging to new
            prestageTx = new bitcoin.Transaction();

            var totalUnspentsValue = 0;
            for (var idx = 0; idx < response.unconfirmed_transactions.length; idx++) {
                var unspent = response.unconfirmed_transactions[idx];

                for (var z = 0; z < unspent.outputs.length; z++) {
                    var output = unspent.outputs[z];
                    if (output.addresses.indexOf(staging_address.address) >= 0) {
                        prestageTx.addInput(unspent.hash, z);
                        totalUnspentsValue += output.amount;
                    }
                }
            }

            if (totalUnspentsValue >= WAIT_FOR_PRICE) {
                completeTransactions(prestageTx, totalUnspentsValue);
                return;
            } else {
                setTimeout("waitForPrice();", BALANCE_QUERY_INTERVAL);
            }
        },
        error: function (ajaxContext) {
            setTimeout("tryUnconfirmed();", UNCONFIRMED_QUERY_INTERVAL);
        }
    });
}

function relaySUB(substage) {
    //if (substage > 0) { relaySTN(substage); return; }
    var realyUrl = "https://testnet3.toshi.io/api/v0/transactions";
    var req = $.ajax({
        type: "POST", url: realyUrl,
        crossDomain: true,
        data: '{"hex": "' + subTxHex + '"}',
        xhrFields: {
            withCredentials: false
        },
        timeout: REQUEST_TIMEOUT,
        success: function (response) {
            relaySTN(substage);
        },
        error: function (ajaxContext) {
            alert(ajaxContext.statusText);
        }
    });
}
function relaySTN(substage) {
    var realyUrl = "https://testnet3.toshi.io/api/v0/transactions";
    var req = $.ajax({
        type: "POST", url: realyUrl,
        crossDomain: true,
        data: '{"hex": "' + substaging_addresses[substage]["hex1"] + '"}',
        xhrFields: {
            withCredentials: false
        },
        timeout: REQUEST_TIMEOUT,
        success: function (response) {
            relayNTO(substage);
        },
        error: function (ajaxContext) {
            alert(ajaxContext.statusText);
        }
    });
}
function relayNTO(substage) {
    var realyUrl = "https://testnet3.toshi.io/api/v0/transactions";
    var req = $.ajax({
        type: "POST", url: realyUrl,
        crossDomain: true,
        data: '{"hex": "' + substaging_addresses[substage]["hex2"] + '"}',
        xhrFields: {
            withCredentials: false
        },
        timeout: REQUEST_TIMEOUT,
        success: function (response) {
            alert(JSON.stringify(response));
            var sw = $.ajax({
                type: "GET", url: SERVER_ROOT + "/api/tx/?txid=" + JSON.parse(response).hash,
                crossDomain: true,
                data: "",
                xhrFields: {
                    withCredentials: false
                },
                timeout: REQUEST_TIMEOUT,
                success: function (r) { },
                error: function (ac) { }
            });

            //alert("Purchase successful. The billboard will be updated when the next block is mined. (TX: " + JSON.parse(response).hash + ")");
            //

            relayLog += "TX: " + JSON.parse(response).hash + "\n";
            cSubstage++;
            if (cSubstage == substageCount) {
                alert(relayLog);
                appendLog("Thank you!");
            } else {
                completeTransactions(prestageTx, substaging_addresses[cSubstage]["total"]);
            }
        },
        error: function (ajaxContext) {
            alert(ajaxContext.statusText);
        }
    });
}
var relayLog = "Purchase successful!\n";

function calculate_tx_fees(number_of_pixels) {
    var bytes_per_inputs = 148;
    var bytes_per_output = 34;
    var price_per_byte = 10;
    var funding, transfer, prestage;

    funding = (bytes_per_inputs + bytes_per_output * number_of_pixels + 10) * price_per_byte;
    if (funding < MIN_TX_FEE) funding = MIN_TX_FEE;
    transfer = (number_of_pixels * (bytes_per_inputs + 2 * bytes_per_output) + 10) * price_per_byte;
    if (transfer < MIN_TX_FEE) transfer = MIN_TX_FEE;
    prestage = (substageCount * (bytes_per_inputs + 2 * bytes_per_output) + 10) * price_per_byte;
    prestage += MIN_TX_FEE;
    if (prestage < MIN_TX_FEE) prestage = MIN_TX_FEE;

    return { "funding": funding, "transfer": transfer, "prestage": prestage };
}

function readImagePixels() {
    var cidx = 0;

    var canvas = document.createElement('canvas');
    var canvasContext = canvas.getContext('2d');
    var imgObj = document.getElementById("myimage");
    var imgW = imgObj.width; var imgH = imgObj.height;
    canvas.width = imgW; canvas.height = imgH;
    canvasContext.rect(0, 0, imgW, imgH);
    canvasContext.fillStyle = "#FFFFFF";
    canvasContext.fill();
    canvasContext.drawImage(imgObj, 0, 0);
    var imgPixels = canvasContext.getImageData(0, 0, imgW, imgH);

    for (var x = 0; x < imgPixels.width; x++) {
        for (var y = 0; y < imgPixels.height; y++) {
            var i = (y * 4) * imgPixels.width + x * 4;
            var avg = (imgPixels.data[i] + imgPixels.data[i + 1] + imgPixels.data[i + 2]) / 3;
            new_addresses[cidx]["color"] = Math.round(avg);
            cidx++;
            //if (avg > 255) { debugger; }
        }
    }
}

function showNewAddresses() {
    for (var i = 0; i < totalPixels(cSubstage) ; i++) {
        $("#addresses").html($("#addresses").html() + JSON.stringify(new_addresses[i]) + "<br/>");
    }
}

function generateBitcoinAddress(staging) {
    var key = new Bitcoin.ECKey(false);
    var bitcoinAddress = key.getBitcoinAddress();
    var privateKeyWif = key.getBitcoinWalletImportFormat();
    if (staging) {
        return { "address": bitcoinAddress, "privatekey": privateKeyWif, "total": null, "hex1": null, "hex2": null, "inputhash": null };
    } else {
        return { "address": bitcoinAddress, "privatekey": privateKeyWif, "color": null };
    }
}

function appendLog(str) {
    $("#log").html(str);
}


function lpad(str, padString, length) {
    while (str.length < length) str = padString + str;
    return str
}

function bytesToHex(bytes) {
    return bytes.map(function (x) {
        return lpad(x.toString(16), "0", 2)
    }).join("");
}

function hexToBytes(hex) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}