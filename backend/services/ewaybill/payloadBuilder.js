// using
const buildEwaybillPayload = (order, body, profile) => {

    const dateToDDMMYYYY = (date) => {
        if (!date) return;

        const d = new Date(date);
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = String(d.getUTCFullYear());
        const formattedDate = `${day}/${month}/${year}`;
        return `${day}/${month}/${year}`;
    };

    // return {
    //     "supplyType": "O",

    //     "subSupplyType": "1",

    //     "subSupplyDesc": "Transaction",

    //     "docType": "INV",

    //     "docNo": "45467dvcdddcdr",

    //     "docDate": "04/07/2025",

    //     "fromGstin": "34AACCC1596Q002",

    //     "fromTrdName": "welton",

    //     "fromAddr1": "4-9-35, GROUND,1ST, 2ND FLOOR, AURANGPURA",

    //     "fromAddr2": "GROUND FLOOR OSBORNE ROAD",

    //     "fromPlace": "FRAZER TOWN",

    //     "fromPincode": 605001,

    //     "actFromStateCode": 34,

    //     "fromStateCode": 34,

    //     "toGstin": "29AWGPV7107B1Z1",

    //     "toTrdName": "sthuthya",

    //     "toAddr1": "Shree Nilaya",

    //     "toAddr1": "GODOWN NO 5 GAT NO 1214/1230 ",

    //     "toPlace": "Beml Nagar",

    //     "toPincode": 562160,

    //     "actToStateCode": 29,

    //     "toStateCode": 29,

    //     "transactionType": 4,

    //     "otherValue": "-100",

    //     "totalValue": 0,

    //     "cgstValue": 0,

    //     "sgstValue": 0,

    //     "igstValue": 0,

    //     "cessValue": 0,

    //     "cessNonAdvolValue": 400,

    //     "totInvValue": 0,

    //     "transporterId": "",

    //     "transporterName": "",

    //     "transDocNo": "DOC/123",

    //     "transMode": "1",

    //     "transDistance": "0",

    //     "transDocDate": "04/07/2025",

    //     "vehicleNo": "PVC1234",

    //     "vehicleType": "R",

    //     "itemList":

    //         [{

    //             "productName": "BLAZER-1",

    //             "productDesc": "BLAZER-1",

    //             "hsnCode": 4421,

    //             "quantity": 25,

    //             "qtyUnit": "NOS",

    //             "cgstRate": 0,

    //             "sgstRate": 0,

    //             "igstRate": 3,

    //             "cessRate": 3,

    //             "cessNonadvol": 0,

    //             "taxableAmount": 5609889

    //         }

    //         ]
    // }

    return {
        "supplyType": body.supplyType,//required Outward(O)/Inward(I) ? !
        "subSupplyType": body.subSupplyType,//required ?    !
        "subSupplyDesc": "",
        "docType": "INV",//required  [ "INV", "CHL", "BIL","BOE","OTH" ],
        // "docNo": order.orderNumber + Math.floor((Math.random() * 10) + 1) ,//required
        "docNo": "6548dcsddfd52",//required
        // "docNo": order.orderNumber,//required
        "docDate": dateToDDMMYYYY(order.orderDate),//required
        // "docDate": "20/06/2025",//required
        "fromGstin": profile.gstin,//required
        "fromTrdName": profile.companyName,
        "fromAddr1": profile.companyAddress,
        "fromPlace": "",// Area or City
        "fromPincode": Number(profile.pinCode),//required     !
        "actFromStateCode": Number(profile.stateCode),//required    !
        "fromStateCode": Number(profile.stateCode),//required       !
        "toGstin": order.gstNumber,//required
        "toTrdName": order.companyName,
        "toAddr1": order.Address,
        "toPlace": "",// Area or City
        "toPincode": Number(order.pinCode),//required   !
        "actToStateCode": Number(order.stateCode),//required  !
        "toStateCode": Number(order.stateCode),//required     !
        "transactionType": Number(body.transactionType),//required  ! ?
        "otherValue": 0,
        "totalValue": order.totalCost,
        "cgstValue": 0,
        "sgstValue": 0,
        "igstValue": 0,
        "cessValue": 0,
        "cessNonAdvolValue": 0,
        "totInvValue": order.roundOffFinalRevenue,//required
        "transporterId": body.transporterId || "",
        "transporterName": body.transporterName || "",
        "transDocNo": body.transDocNo || "",
        "transMode": body.transMode || "",   //(Road-1, Rail-2, Air-3, Ship-4) !    
        "transDistance": body.transDistance,//required   !
        "transDocDate": dateToDDMMYYYY(body.transDocDate) || "",   //!
        "vehicleNo": body.vehicleNo || "",        // !
        "vehicleType": body.vehicleType || "",            // !
        // pallavi maam
        "itemList": order.subOrders.map((sub) => ({
            "productName": sub.orderName,
            "productDesc": sub.designNumber,
            "hsnCode": sub.hsnCode,
            "quantity": sub.quantity,
            "qtyUnit": sub.qtyUnit,
            "cgstRate": Number(order.stateCode) === Number(profile.stateCode) ? 2.5 : 0,
            "sgstRate": Number(order.stateCode) === Number(profile.stateCode) ? 2.5 : 0,
            "igstRate": Number(order.stateCode) !== Number(profile.stateCode) ? 5 : 0,
            "cessRate": 0,
            "cessNonadvol": 0,
            "taxableAmount": (sub.quantity - sub.shortPcs) * sub.unitPrice
        })),
    }
};

module.exports = { buildEwaybillPayload };