import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.util.Base64;
import java.util.Properties;

/**
 * Signe (ou vérifie) le paquet de mise à jour automatique de l'app Android avec la clé de signature de l'APK.
 * La clé privée ne quitte jamais l'ordinateur ; le mot de passe est lu dans keystore.properties et jamais affiché.
 *
 *   java tools/SignBundle.java sign   <ota-bundle.zip> <ota-bundle.sig> <keystore.properties>
 *   java tools/SignBundle.java verify <ota-bundle.zip> <ota-bundle.sig> <keystore.properties>
 */
public class SignBundle {
    public static void main(String[] a) throws Exception {
        if (a.length != 4) { System.err.println("usage: sign|verify zip sig keystore.properties"); System.exit(2); }
        Path propsPath = Path.of(a[3]);
        Properties p = new Properties();
        try (InputStream in = new FileInputStream(propsPath.toFile())) { p.load(in); }
        Path ks = propsPath.getParent().resolve(p.getProperty("storeFile").replaceFirst("^\\.\\./keystore/", "")).normalize();
        KeyStore store = KeyStore.getInstance(ks.toString().endsWith(".p12") ? "PKCS12" : "JKS");
        try {
            try (InputStream in = new FileInputStream(ks.toFile())) { store.load(in, p.getProperty("storePassword").toCharArray()); }
        } catch (Exception e) {
            store = KeyStore.getInstance("PKCS12");
            try (InputStream in = new FileInputStream(ks.toFile())) { store.load(in, p.getProperty("storePassword").toCharArray()); }
        }
        String alias = p.getProperty("keyAlias");
        byte[] data = Files.readAllBytes(Path.of(a[1]));
        if (a[0].equals("sign")) {
            PrivateKey key = (PrivateKey) store.getKey(alias, p.getProperty("keyPassword").toCharArray());
            Signature s = Signature.getInstance("SHA256withRSA");
            s.initSign(key); s.update(data);
            Files.writeString(Path.of(a[2]), Base64.getEncoder().encodeToString(s.sign()) + "\n");
            System.out.println("signé : " + a[2]);
        } else {
            Certificate cert = store.getCertificate(alias);
            Signature s = Signature.getInstance("SHA256withRSA");
            s.initVerify(cert.getPublicKey()); s.update(data);
            boolean ok = s.verify(Base64.getDecoder().decode(Files.readString(Path.of(a[2])).trim()));
            System.out.println(ok ? "signature valable" : "SIGNATURE INVALIDE");
            System.exit(ok ? 0 : 1);
        }
    }
}
