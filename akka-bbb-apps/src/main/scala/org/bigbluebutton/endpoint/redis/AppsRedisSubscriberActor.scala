package org.bigbluebutton.endpoint.redis

import akka.actor.Props
import akka.actor.OneForOneStrategy
import akka.actor.SupervisorStrategy.Resume
import java.io.{ PrintWriter, StringWriter }
import java.net.InetSocketAddress
import redis.actors.RedisSubscriberActor
import redis.api.pubsub.{ PMessage, Message }
import scala.concurrent.duration._
import akka.actor.ActorRef
import akka.actor.actorRef2Scala
import org.bigbluebutton.SystemConfiguration
import org.bigbluebutton.core.pubsub.receivers.RedisMessageReceiver
import redis.api.servers.ClientSetname

object AppsRedisSubscriberActor extends SystemConfiguration {

  val channels = Seq("time")
  val patterns = Seq("bigbluebutton:to-bbb-apps:*", "bigbluebutton:from-voice-conf:*", "bigbluebutton:from-bbb-transcode:*")

  def props(msgReceiver: RedisMessageReceiver): Props =
    Props(classOf[AppsRedisSubscriberActor], msgReceiver,
      redisHost, redisPort,
      channels, patterns).withDispatcher("akka.rediscala-subscriber-worker-dispatcher")
}

class AppsRedisSubscriberActor(msgReceiver: RedisMessageReceiver, redisHost: String,
  redisPort: Int,
  channels: Seq[String] = Nil, patterns: Seq[String] = Nil)
    extends RedisSubscriberActor(
      new InetSocketAddress(redisHost, redisPort),
      channels, patterns) {

  override val supervisorStrategy = OneForOneStrategy(maxNrOfRetries = 10, withinTimeRange = 1 minute) {
    case e: Exception => {
      val sw: StringWriter = new StringWriter()
      sw.write("An exception has been thrown on AppsRedisSubscriberActor, exception message [" + e.getMessage() + "] (full stacktrace below)\n")
      e.printStackTrace(new PrintWriter(sw))
      log.error(sw.toString())
      Resume
    }
  }

  // Set the name of this client to be able to distinguish when doing
  // CLIENT LIST on redis-cli
  write(ClientSetname("BbbAppsAkkaSub").encodedRequest)

  def onMessage(message: Message) {
    log.error(s"SHOULD NOT BE RECEIVING: $message")
  }

  def onPMessage(pmessage: PMessage) {
    //log.debug(s"RECEIVED:\n $pmessage \n")
    msgReceiver.handleMessage(pmessage.patternMatched, pmessage.channel, pmessage.data)
  }
}