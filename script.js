/*
 * ====================================================================
 * amiibo-generator Copyright (C) 2020 hax0kartik
 * Copyright (C) 2021 AbandonedCart @ TagMo
 * ====================================================================
 */

(function() {
  var keysLoaded = false;
  var amiiboDatabase = null;
  var amiiboZip = null;
  var g_data = null;

  function populateTable() {
    const amiiboAPI = "https://raw.githubusercontent.com/8bitDream/AmiiboAPI/render/";
    $.getJSON(amiiboAPI + "database/amiibo.json", function(data) {
      amiiboDatabase = data;
      g_data = data;
      var t = $('#dataTable').DataTable();
      Object.keys(data.amiibos).forEach(function(key) {
        var ami = data.amiibos[key];
        var name = ami.name;
        var keytext = key.padStart(16, '0');
        var keylink = key.substring(2).padStart(16, '0');

        var link = amiiboAPI + "images/icon_" + keylink.substr(0, 8) + "-" + keylink.substr(8, 8) + ".png"
        var image = `<div class="amiibo-image"><img src="${link}" /></div>`;
        t.row.add([image, `<span class="table-text">${name}</span>`, `<span class="table-text">${keytext}</span>`]);
      });
      t.draw(false);
      // generateZip();
    });
  };

  function getRandomBytes(count) {
    var output = new Uint8Array(count);
    for (var i = 0; i < output.length; i++) {
      output[i] = Math.round(Math.random() * 255);
    }
    return output;
  };

  function generateRandomUID(count) {
    var uid = getRandomBytes(9);
    uid[0x0] = 0x04;
    uid[0x3] = 0x88 ^ uid[0] ^ uid[1] ^ uid[2];
    uid[0x8] = uid[4] ^ uid[5] ^ uid[6] ^ uid[7];
    return uid;
  };

  function generateData(id) {
    var arr = new Uint8Array(532);

    // Set UID, BCC0
    // arr.set([0x04, 0xC0, 0x0A, 0x46, 0x61, 0x6B, 0x65, 0x0A], 0x1D4);
    var uid = generateRandomUID();
    arr.set(uid, 0x1D4);

    // Set BCC1
    arr[0] = uid[0x8];

    // Set Internal, Static Lock, and CC
    arr.set([0x48, 0x0F, 0xE0, 0xF1, 0x10, 0xFF, 0xEE], 0x1);

    // Set 0xA5, Write Counter, and Unknown
    arr.set([0xA5, 0x00, 0x00, 0x00], 0x28);

    // Set Dynamic Lock, and RFUI
    arr.set([0x01, 0x00, 0x0F, 0xBD], 0x208);

    // Set CFG0
    arr.set([0x00, 0x00, 0x00, 0x04], 0x20C);

    // Set CFG1
    arr.set([0x5F, 0x00, 0x00, 0x00], 0x210);

    // Set Keygen Salt
    arr.set(getRandomBytes(32), 0x1E8);

    var off1 = 0x54, off2 = 0x1DC;
    id = id.substring(2);
    // Write Identification Block
    for (var i = 0; i < 16; i += 2, off1 += 1, off2 += 1) {
      var currByte = parseInt(id.substring(i, i + 2), 16);
      arr[off1] = currByte;
      arr[off2] = currByte;
    }

    return arr;
  };

  function getSignedData(id) {
    var signedData = new Uint8Array(572);
    signedData.set(generateData(id), 0x0);
    var tagmo = "5461674d6f20382d426974204e544147";
    for (var signature = [], c = 0; c < tagmo.length; c += 2) {
      signature.push(parseInt(tagmo.substr(c, 2), 16));
    }
    signedData.set(signature, 0x21C);
    return signedData;
  };

  function downloadBin(name, id) {
    var data = getSignedData(id);

    file = name + "[" + id.substr(4, 12) + "]" + (keysLoaded ? "" : "-Foomiibo") + ".bin";
    console.log(file)
    download("data:application/octet-stream;base64," + base64.fromBytes(data), file, "application/octet-stream");
    
    try {
      const ndef = new NDEFReader();
      await ndef.write("data:application/octet-stream;base64," + base64.fromBytes(data));
      document.write("> Message written");
    } catch (error) {
      document.write("Argh! " + error);
    }
  };

  function generateZip() {
    const specialCharacters = ["<", ">", ":", "\"", "/", "\\", "|", "?", "*"];
    var zip = new JSZip();
    Object.keys(amiiboDatabase.amiibos).forEach(function(key) {
      var ami = amiiboDatabase.amiibos[key];
      ami.series = amiiboDatabase.amiibo_series["0x"+key.substr(14, 2)]

      var file = ami.name + "[" + key.substr(4, 12) + "]" + (keysLoaded ? "" : "-Foomiibo") + ").bin";

      specialCharacters.forEach(function(char) {
        file = file.replace(char, "_");
      });

      var folder = zip.folder(ami.series);
      folder.file(file, getSignedData(key))
    })

    zip.generateAsync({type:"blob"}).then(function(content) {
      amiiboZip = content;
      $("#loader").hide();
      $(".hide_until_zipped").removeClass("hide_until_zipped");
      $("a#downloadZip").click(function(e) {
        e.preventDefault();
        download(amiiboZip, 'amiibo.zip', 'application/octet-stream');
      })
    })
  };

  // Run on page load
  $(function() {
    populateTable();
    oTable = $('#dataTable').DataTable({
      "lengthMenu": [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
    });

    $('#dataTable tbody').on('click', 'tr', function() {
      var data = oTable.row( this ).data();
      downloadBin($(data[1]).text(), $(data[2]).text());
    });

    $('#input').keyup(function() {
      oTable.search(jQuery.fn.DataTable.ext.type.search.string($(this).val())).draw();
    })

    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('s') || urlParams.has('q')) {
    	var params = urlParams.has('q') ? urlParams.get('q') : urlParams.get('s');
    	oTable.search(jQuery.fn.DataTable.ext.type.search.string(params)).draw();
    }
  });
})();
